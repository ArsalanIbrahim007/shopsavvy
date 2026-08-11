// scraper.utils.js
// Shared helpers used across all platform scrapers (PriceOye, Mega, Shophive).
// Keeping this logic in one place means normalization downstream can trust
// that every scraper emits prices/strings in the same shape.

import axios from "axios";

// Common headers to look like a real browser request.
// Tweak per-platform if a site blocks the default UA.
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Wrapper around axios.get with sane defaults + basic retry.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.retries=2]
 * @param {number} [opts.timeout=10000]
 */
async function fetchHtml(url, opts = {}) {
  const {
    retries = 2,
    timeout = 10000,
    headers = {},
  } = opts;

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
        },

        timeout,

        maxRedirects: 5,

        responseType: "text",

        validateStatus(status) {
          return status >= 200 && status < 300;
        },
      });

      return res.data;
    } catch (err) {
      lastErr = err;

      const status = err.response?.status;

      /*
       * Retrying most 4xx responses with exactly the same request
       * is pointless. 429 is the exception because rate limiting
       * can be temporary.
       */
      const permanentClientError =
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429;

      if (permanentClientError) {
        break;
      }

      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  const status = lastErr?.response?.status;

  const detail = status
    ? `HTTP ${status}: ${lastErr.message}`
    : lastErr?.message || "Unknown request error";

  throw new Error(
    `fetchHtml failed for ${url}: ${detail}`
  );
}

/**
 * Converts messy price strings like "Rs. 49,999" or "PKR 49999/-"
 * into a clean integer (49999). Returns null if unparseable.
 */
function parsePrice(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? null : Math.round(value);
}

/**
 * Trims/collapses whitespace in scraped text fields.
 */
function cleanText(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(/<[^>]*>/g, " ")   // strip any HTML that leaked from the page
    .replace(/\s+/g, " ")
    .trim();
}

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
  cleanText,
  sleep,
  safeMap,
  DEFAULT_HEADERS,
};
