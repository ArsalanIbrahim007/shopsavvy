// telemart.scraper.js
//
// Telemart redirects to telex.pk (same store, new domain). Their ToS
// (Section 14) allows agent access provided the agent identifies itself
// honestly and does not pretend to be a person. We use their public
// read-only JSON endpoints — no login, no cart, no getting around blocks.
//
// Endpoints used (all public, read-only):
//   /search/suggest.json?q=<term>&resources[type]=product&resources[limit]=10
//   /collections/<handle>/products.json?limit=250&page=<n>
//
// On 429: respect Retry-After, back off, do not retry more than once.
// User-Agent: see AGENT_UA below.

import axios from "axios";
import { waitForTurn } from "./politeJson.js";
import { parsePrice, cleanText } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "telemart";
const BASE_URL = "https://www.telex.pk";
const HOST = "www.telex.pk";
const TIMEOUT_MS = 15000;

// Section 14 of telex.pk's ToS requires agents to identify themselves.
// Format: <product>/<version> (<description>) Agent/<name>
// The "Agent/<name>" suffix is required by Section 14.4(i).
const AGENT_UA =
  "ShopSavvyBot/1.0 (student price-comparison project; Bahria University Karachi) Agent/ShopSavvyBot";

// Collections to scrape for TVs and monitors (never returned by search).
// Confirmed live 2026-10-25 from /collections.json.
const TV_COLLECTIONS = ["4k-ultra-leds", "3d-tvs"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches JSON from a telex.pk endpoint with the honest agent UA.
 * Uses politeJson's waitForTurn for the 1500 ms per-host gap.
 * Respects Retry-After on 429 (one retry only — if the store is
 * rate-limiting us, hammering it harder makes it worse).
 *
 * @param {string} path  e.g. "/search/suggest.json?q=samsung"
 * @returns {Promise<object|null>}  null on 429 or network error
 */
async function telexGet(path) {
  const url = `${BASE_URL}${path}`;

  const doRequest = async () => {
    await waitForTurn(HOST);
    const response = await axios.get(url, {
      headers: {
        "User-Agent": AGENT_UA,
        "Accept": "application/json",
      },
      timeout: TIMEOUT_MS,
      maxRedirects: 3,
      responseType: "json",
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return response.data;
  };

  try {
    return await doRequest();
  } catch (err) {
    const status = err?.response?.status;
    if (status === 429) {
      const retryAfter = Number(err?.response?.headers?.["retry-after"] ?? 3);
      console.warn(`[${PLATFORM}] 429 on ${path} — waiting ${retryAfter}s then retrying once`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      try {
        return await doRequest();
      } catch (retryErr) {
        console.warn(`[${PLATFORM}] 429 retry also failed for ${path}: ${retryErr.message}`);
        return null;
      }
    }
    console.warn(`[${PLATFORM}] request failed for ${path}: ${err.message}`);
    return null;
  }
}

/**
 * Reads the condition label from a product's tags.
 * Telemart marks used/open-box products with tags like "Used", "Open Box",
 * "Refurbished". Returns "used", "open-box", or null (new/unspecified).
 *
 * @param {string[]} tags
 * @returns {"used"|"open-box"|null}
 */
function readCondition(tags) {
  if (!Array.isArray(tags)) return null;
  const flat = tags.map((t) => t.toLowerCase());
  if (flat.some((t) => t.includes("used") || t.includes("refurbished"))) return "used";
  if (flat.some((t) => t.includes("open box") || t.includes("open-box"))) return "open-box";
  return null;
}

/**
 * Parses one Shopify product object (from /products.json or suggest.json)
 * into a ScrapedListing. Returns null if the product cannot be parsed.
 *
 * @param {object} product  Raw product object from telex.pk JSON
 * @returns {import('./scraper.schema').ScrapedListing|null}
 */
function parseTelemartProduct(product) {
  if (!product || !product.handle) return null;

  const title = cleanText(product.title);
  if (!title) return null;

  // Build canonical URL — strip Shopify tracking params (_pos, _sid, _ss).
  const sourceUrl = `${BASE_URL}/products/${product.handle}`;

  // Price: prefer the first available variant; fall back to top-level price.
  // Shopify prices are strings ("61549.00").
  const variant = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants.find((v) => v.available) ?? product.variants[0]
    : null;

  const rawPrice = parsePrice(
    variant?.price ?? product.price ?? null
  );
  // suggest.json uses compare_at_price_max at the top level (variants is []).
// products.json uses compare_at_price on the variant.
const rawOriginal = parsePrice(
  variant?.compare_at_price ??
  product.compare_at_price ??
  product.compare_at_price_max ??
  null
);

    // Validate: price must be >= PKR 100; was-price must be above price and
  // under 10x (catches misparsed concatenated numbers).
  // TODO: replace with validatePricePair() once Z6 merges.
  const price = typeof rawPrice === "number" && rawPrice >= 100 ? rawPrice : null;
  if (!price) return null;
  const originalPrice =
    typeof rawOriginal === "number" &&
    rawOriginal > price &&
    rawOriginal <= price * 10
      ? rawOriginal
      : null;

  // Image: variant featured image → first product image → top-level image.
  const imageUrl =
    variant?.featured_image?.src ??
    (Array.isArray(product.images) && product.images[0]?.src) ??
    product.image?.url ??
    product.image ??
    product.featured_image?.url ??
    null;

  // In-stock: variant level when available, otherwise top-level.
  const inStock = variant ? Boolean(variant.available) : Boolean(product.available);

  // Condition: 25% of Telemart listings are used/open-box — read from tags.
  const condition = readCondition(product.tags);

  return makeListing({
    platform: PLATFORM,
    sourceUrl,
    title,
    price,
    originalPrice,
    imageUrl: typeof imageUrl === "string" ? imageUrl : null,
    inStock,
    ...(condition ? { condition } : {}),
  });
}

// ─── Parser (exported for fixture tests) ──────────────────────────────────────

/**
 * Parses a telex.pk /search/suggest.json response into listings.
 * Separated from fetching so tests can run against saved JSON without
 * making network requests.
 *
 * @param {object} json  Raw response from /search/suggest.json
 * @returns {import('./scraper.schema').ScrapedListing[]}
 */
function parseTelemartSuggestJson(json) {
  const products = json?.resources?.results?.products ?? [];
  return products
    .map(parseTelemartProduct)
    .filter(Boolean);
}

/**
 * Parses a telex.pk /collections/{handle}/products.json response.
 *
 * @param {object} json  Raw response from /collections/.../products.json
 * @returns {import('./scraper.schema').ScrapedListing[]}
 */
function parseTelemartCollectionJson(json) {
  const products = json?.products ?? [];
  return products
    .map(parseTelemartProduct)
    .filter(Boolean);
}

// ─── Scraper entry points ─────────────────────────────────────────────────────

/**
 * Scrapes telex.pk via the search suggest endpoint.
 * URL format: the caller passes the full search URL; we extract the query.
 *
 * Used for all searches except TVs (which never appear in search results).
 *
 * @param {string} searchUrl  e.g. https://www.telex.pk/search?q=samsung
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeTelemartSearch(searchUrl) {
  let query;
  try {
    query = new URL(searchUrl).searchParams.get("q") ?? "";
  } catch {
    query = "";
  }

  if (!query) {
    console.warn(`[${PLATFORM}] no query found in URL: ${searchUrl}`);
    return [];
  }

  const path =
    `/search/suggest.json?q=${encodeURIComponent(query)}` +
    `&resources[type]=product&resources[limit]=10`;

  const json = await telexGet(path);
  if (!json) return [];

  const listings = parseTelemartSuggestJson(json);

  if (listings.length === 0) {
    console.warn(`[${PLATFORM}] no products in suggest response for "${query}"`);
  }

  return listings;
}

/**
 * Scrapes one telex.pk collection page.
 * Used for TV collections that never appear in search results.
 *
 * @param {string} handle  Collection handle, e.g. "4k-ultra-leds"
 * @param {number} [page=1]
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeTelemartCollection(handle, page = 1) {
  const path = `/collections/${handle}/products.json?limit=250&page=${page}`;
  const json = await telexGet(path);
  if (!json) return [];
  return parseTelemartCollectionJson(json);
}

export {
  scrapeTelemartSearch,
  scrapeTelemartCollection,
  parseTelemartSuggestJson,
  parseTelemartCollectionJson,
  readCondition,
  TV_COLLECTIONS,
};