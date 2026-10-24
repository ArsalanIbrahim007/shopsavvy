import axios from "axios";

import { UnsafeUrlError, assertPublicUrl, assertRedirectIsPublic } from "../services/outboundUrlGuard.service.js";

// ─── User-Agent ───────────────────────────────────────────────────────────────
// TODO (Z6-c): team decision pending. Telemart ToS flagged to Arsalan 2026-10-03.
// Current value mimics desktop Chrome. New Shopify/WooCommerce adapters already
// use an honest string. Once the team agrees, change this to:
// "ShopSavvyBot/1.0 (student price-comparison project; Bahria University Karachi)"
// and test each store for 403 responses before merging.
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Per-host request throttle ────────────────────────────────────────────────
/**
 * Minimum gap (ms) between successive requests to the same host.
 * Matches the 1500 ms used by politeJson.js so HTML and JSON scrapers
 * behave consistently. Override per-scraper via the HOST_DELAY_MS export
 * if a store needs a longer pause.
 */
const HOST_DELAY_MS = Number(process.env.SCRAPER_HOST_DELAY_MS) || 1500;

/** Timestamp of the next allowed request time for each hostname. */
const nextAllowedAt = new Map();

/**
 * Enforces a minimum delay between successive requests to the same host.
 * Call this before every page fetch inside a scraper loop.
 *
 * The slot is reserved before sleeping so concurrent callers for the same
 * host queue up correctly: each one grabs the next available slot and waits
 * for it, rather than all reading the same "last request" time and going out
 * together.
 *
 * @param {string} url      Full URL of the next request (hostname is extracted).
 * @param {number} [delayMs]  Override the default HOST_DELAY_MS for this call.
 */
async function politeDelay(url, delayMs = HOST_DELAY_MS) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return; // unparseable URL — let fetchHtml surface the error
  }

  const now = Date.now();
  const last = nextAllowedAt.get(host) ?? now;
  // Reserve the slot first, then wait — prevents concurrent requests from
  // reading the same last-request time and going out simultaneously.
  const next = Math.max(now, last) + delayMs;
  nextAllowedAt.set(host, next);
  const wait = next - delayMs - now; // how long until our reserved slot starts
  if (wait > 0) await sleep(wait);
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────
/**
 * Wrapper around axios.get with sane defaults + basic retry.
 *
 * Calls politeDelay before the first attempt and before every retry so we
 * never hammer a host even when a request fails and is retried.
 *
 * The SSRF guard (assertPublicUrl / assertRedirectIsPublic) ensures we only
 * ever fetch public internet addresses — never localhost, link-local, or cloud
 * metadata addresses (169.254.x.x, fd00::/8, etc.). See
 * services/outboundUrlGuard.service.js for the full list of blocked ranges.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.retries=2]
 * @param {number} [opts.timeout=10000]
 * @param {boolean} [opts.skipDelay=false]  Set true only for a one-off fetch
 *   where politeDelay was already called by the caller.
 */
async function fetchHtml(url, opts = {}) {
  const {
    retries = 2,
    timeout = 10000,
    headers = {},
    skipDelay = false,
  } = opts;

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Apply the delay before every attempt (including retries) so a failing
    // request does not bypass the per-host rate limit on its retry.
    if (!skipDelay) await politeDelay(url);

    try {
      await assertPublicUrl(url);

      const res = await axios.get(url, {
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
        },
        timeout,
        maxRedirects: 5,
        beforeRedirect: assertRedirectIsPublic,
        responseType: "text",
        validateStatus(status) {
          return status >= 200 && status < 300;
        },
      });

      return res.data;
    } catch (err) {
      lastErr = err;

      const status = err.response?.status;

      if (err instanceof UnsafeUrlError && !err.transient) {
        throw new Error(`fetchHtml refused ${url}: ${err.message}`);
      }

      const permanentClientError =
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429;

      if (permanentClientError) break;
    }
  }

  const status = lastErr?.response?.status;
  const detail = status
    ? `HTTP ${status}: ${lastErr.message}`
    : lastErr?.message || "Unknown request error";

  throw new Error(`fetchHtml failed for ${url}: ${detail}`);
}

// ─── Price parsing and validation ─────────────────────────────────────────────
/**
 * Converts messy price strings like "Rs. 49,999" or "PKR 49999/-"
 * into a clean integer (49999). Returns null if unparseable.
 */
function parsePrice(raw) {
  if (raw == null) return null;
  const match = String(raw).match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Validates a parsed price pair and enforces the project's data-quality rules:
 *
 *   - price must be >= PKR 100 (prices below 100 are almost always a parse
 *     error: a blog article priced at PKR 20, a missing decimal, a currency
 *     symbol read as digits)
 *   - originalPrice (the store's "was" price) must be strictly above price,
 *     or null — a was-price at or below the current price is almost always
 *     a parse error and would poison the fake-discount checks
 *   - originalPrice must not exceed 10× the current price — a ratio above
 *     that is almost certainly a misparse (e.g. Telemart Haier 98" TV:
 *     price 786,999, was 11,005,000 — two numbers run together)
 *
 * The backend's priceSanity.service.js is a safety net, not a substitute.
 * Getting this right at the source means the backend's anomaly report stays
 * clean from the start.
 *
 * @param {number|null} price          Parsed current price
 * @param {number|null} originalPrice  Parsed "was" price (may be null)
 * @returns {{ price: number|null, originalPrice: number|null }}
 */
function validatePricePair(price, originalPrice) {
  const cleanPrice =
    typeof price === "number" && price >= 100 ? price : null;

  let cleanOriginal = null;
  if (
    typeof originalPrice === "number" &&
    originalPrice > 0 &&
    cleanPrice !== null &&
    originalPrice > cleanPrice &&
    originalPrice <= cleanPrice * 10
  ) {
    cleanOriginal = originalPrice;
  }

  return { price: cleanPrice, originalPrice: cleanOriginal };
}

// ─── Text helpers ─────────────────────────────────────────────────────────────
/**
 * Trims/collapses whitespace in scraped text fields.
 */
function cleanText(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a scraper's per-item parsing logic so one bad item
 * doesn't crash the whole scrape run.
 */
function safeMap(items, mapFn, platformName) {
  const results = [];
  for (const item of items) {
    try {
      const parsed = mapFn(item);
      if (parsed) results.push(parsed);
    } catch (err) {
      console.warn(`[${platformName}] skipped item due to parse error:`, err.message);
    }
  }
  return results;
}

export {
  fetchHtml,
  parsePrice,
  validatePricePair,
  cleanText,
  sleep,
  safeMap,
  politeDelay,
  HOST_DELAY_MS,
  DEFAULT_HEADERS,
};