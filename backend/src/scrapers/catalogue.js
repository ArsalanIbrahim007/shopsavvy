// catalogue.js — a store's whole catalogue, page by page, as listings (catalogueRefresh.service.js keeps our prices fresh with it).
//
// Searching refreshes a store one product at a time: about 6,400 searches over three nights, and AlfaMall (42% of our listings) was
// only 30% up to date within a day (2026-11-08). These stores publish their catalogue in pages, so a few hundred polite requests
// read every product they sell:
//
//   Shopify       /products.json?limit=250&page=N                 (allowed by their robots.txt; checked 2026-11-08)
//   WooCommerce   /wp-json/wc/store/v1/products?per_page=100      (the Store API their own pages use; the adapter searches it already)
//   Storefront    the AlfaMall / DigiMall search API, one brand at a time (it answers at most 10,000 results per search)
//   Magento       /graphql?query={ products(...) }                  (Shophive: its storefront's own API, over GET; checked 2026-11-09)
//
// Each item becomes a listing exactly as the store's search adapter makes it (same address, same title), so the refresh updates the
// listing we hold instead of adding a second one. Every request goes through politeJson (one request per store every 1.5 s, no
// retry of a refusal).

import { makeListing } from "./scraper.schema.js";
import { cleanText, parsePrice, safeMap } from "./scraper.utils.js";
import { fetchJson as politeFetchJson } from "./politeJson.js";
import { storefrontListing } from "./storefront.scraper.js";
import { VARIATIONS_PER_PAGE, decode, listingsFromVariations, toListing as wooListing } from "./woocommerce.scraper.js";

export const SHOPIFY_PER_PAGE = 250;
export const WOO_PER_PAGE = 100;
export const STOREFRONT_PER_PAGE = 40;
export const STOREFRONT_MAX_RESULTS = 10000; // the storefront API's cap on one search
export const MAX_PAGES = 400; // a guard: no store we read has more than 100,000 products

/** A Shopify product (from /products.json) as a listing, the way the search adapter makes it: its lowest price, at /products/<handle>. */
export function shopifyListing({ platform, baseUrl }, product) {
  const title = cleanText(product?.title);
  const handle = String(product?.handle ?? "").trim();
  if (!title || !handle || /[\s/?#]/.test(handle)) return null;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const priced = variants.map((v) => ({ v, price: parsePrice(v.price) })).filter((x) => x.price > 0);
  if (priced.length === 0) return null; // listed without a price: nothing to compare
  const price = Math.min(...priced.map((x) => x.price));
  const compareAt = Math.max(0, ...priced.filter((x) => x.price === price).map((x) => parsePrice(x.v.compare_at_price) || 0));
  const image = product.images?.[0]?.src ?? product.image?.src ?? null;
  return makeListing({
    platform,
    sourceUrl: `${baseUrl}/products/${handle}`,
    title,
    price,
    originalPrice: compareAt > price ? compareAt : null,
    imageUrl: image ? String(image).replace(/^\/\//, "https://") : null,
    inStock: variants.some((v) => v.available !== false),
  });
}

// Magento (Shophive, 2026-11-09): its storefront's own GraphQL API, which answers a products query over GET without a login. Its
// robots.txt is empty (everything allowed). 7,920 products in 80 pages of 100, sorted by name so the pages do not shift while read.
export const MAGENTO_PER_PAGE = 100;
const magentoQuery = (page) =>
  `{ products(filter: { price: { from: "1" } }, pageSize: ${MAGENTO_PER_PAGE}, currentPage: ${page}, sort: { name: ASC }) ` +
  "{ total_count page_info { total_pages } items { name url_key url_suffix stock_status small_image { url } " +
  "price_range { minimum_price { final_price { value } regular_price { value } } } } } }";

/** A Magento product (from its GraphQL API) as a listing, the way the store's search scraper makes it: at /<url_key>/. */
export function magentoListing({ platform, baseUrl }, item) {
  const title = cleanText(item?.name);
  const key = String(item?.url_key ?? "").trim();
  if (!title || !key || /[\s?#]/.test(key)) return null;
  const prices = item.price_range?.minimum_price ?? {};
  const price = Number(prices.final_price?.value);
  if (!(price > 0)) return null;
  const regular = Number(prices.regular_price?.value);
  return makeListing({
    platform,
    sourceUrl: `${baseUrl}/${key}${item.url_suffix ?? "/"}`,
    title,
    price,
    originalPrice: regular > price ? regular : null,
    imageUrl: item.small_image?.url ?? null,
    inStock: item.stock_status !== "OUT_OF_STOCK",
  });
}

/** Every page of a Magento store's catalogue. As for the other readers: a later page that fails ends the read and is reported. */
export async function* magentoCatalogue(store, { fetchJson = politeFetchJson, onError } = {}) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    let body;
    try {
      body = await fetchJson(`${store.baseUrl}/graphql?query=${encodeURIComponent(magentoQuery(page))}`);
    } catch (error) {
      if (page === 1) throw error;
      onError?.({ page, error });
      return;
    }
    const products = body?.data?.products;
    if (!products || !Array.isArray(products.items)) {
      if (page === 1) throw new Error(`${store.platform}: unexpected catalogue response`);
      onError?.({ page, error: new Error(`${store.platform}: unexpected catalogue response at page ${page}`) });
      return;
    }
    if (products.items.length > 0) yield safeMap(products.items, (item) => magentoListing(store, item), store.platform);
    if (products.items.length === 0 || page >= Number(products.page_info?.total_pages ?? 0)) return;
  }
  onError?.({ page: MAX_PAGES, error: new Error(`${store.platform}: stopped at ${MAX_PAGES} pages, the catalogue goes on`) });
}

// Shopify answers at most 100 pages (25,000 products) by page number, then "400": a department store (Al-Fatah) has more. The
// pages read until then are kept, and the rest is left to the searches.
export const SHOPIFY_MAX_PAGES = 100;

/**
 * Every page of a Shopify store's catalogue, as arrays of listings: the whole store, or only `store.collections` when it names some
 * (a department store whose catalogue is larger than Shopify will page through). A later page that fails ends that read; the first
 * must not.
 */
export async function* shopifyCatalogue(store, options = {}) {
  const paths = store.collections?.length ? store.collections.map((handle) => `/collections/${encodeURIComponent(handle)}/products.json`) : ["/products.json"];
  for (const path of paths) yield* shopifyPages(store, path, options);
}

async function* shopifyPages(store, path, { fetchJson = politeFetchJson, onError } = {}) {
  for (let page = 1; page <= SHOPIFY_MAX_PAGES; page++) {
    let body;
    try {
      body = await fetchJson(`${store.baseUrl}${path}?limit=${SHOPIFY_PER_PAGE}&page=${page}`);
    } catch (error) {
      if (page === 1) throw error;
      onError?.({ page, error });
      return;
    }
    const products = body?.products;
    if (!Array.isArray(products)) {
      if (page === 1) throw new Error(`${store.platform}: unexpected catalogue response`);
      onError?.({ page, error: new Error(`${store.platform}: unexpected catalogue response at page ${page}`) });
      return;
    }
    if (products.length === 0) return;
    yield safeMap(products, (product) => shopifyListing(store, product), store.platform);
    if (products.length < SHOPIFY_PER_PAGE) return;
  }
  // Every page was full: the store has more than Shopify serves, so this was not the whole catalogue (the refresh then marks nothing gone).
  onError?.({ page: SHOPIFY_MAX_PAGES, error: new Error(`${store.platform}: stopped at ${SHOPIFY_MAX_PAGES} pages, the catalogue goes on`) });
}

/**
 * Every page of a WooCommerce store's catalogue: each product at its own lowest price, as the search adapter lists an unexpanded one.
 * A variable product for which `expand(permalink)` is true is read with its variations instead (one request more), giving one
 * listing per capacity and price exactly as a search makes them: at Techroid all 309 listings the plain catalogue missed were
 * such variations (2026-11-08).
 */
export async function* wooCatalogue(store, { fetchJson = politeFetchJson, expand = () => false, onError } = {}) {
  const api = `${store.baseUrl}/wp-json/wc/store/v1/products`;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchJson(`${api}?per_page=${WOO_PER_PAGE}&page=${page}`);
    if (!Array.isArray(batch)) {
      if (page === 1) throw new Error(`${store.platform}: unexpected catalogue response`);
      onError?.({ page, error: new Error(`${store.platform}: unexpected catalogue response at page ${page}`) });
      return;
    }
    if (batch.length === 0) return;
    const listings = [];
    for (const product of batch) {
      if (!product?.permalink) continue;
      const name = decode(product.name);
      if (product.type === "variable" && expand(String(product.permalink).split("?")[0])) {
        try {
          const variations = await fetchJson(`${api}?type=variation&parent=${encodeURIComponent(product.id)}&per_page=${VARIATIONS_PER_PAGE}`);
          if (Array.isArray(variations) && variations.length > 0) {
            listings.push(...listingsFromVariations(store.platform, product, name, variations));
            continue;
          }
        } catch (error) {
          console.warn(`[${store.platform}] could not read the variations of "${name}": ${error.message}`);
        }
      }
      listings.push(...safeMap([product], (p) => wooListing(store.platform, p, { title: name }), store.platform));
    }
    yield listings;
    if (batch.length < WOO_PER_PAGE) return;
  }
  onError?.({ page: MAX_PAGES, error: new Error(`${store.platform}: stopped at ${MAX_PAGES} pages, the catalogue goes on`) });
}

/**
 * Every page of a storefront marketplace's results for each of `terms` (brand names: the API answers at most 10,000 results per
 * search, and AlfaMall sells more than that, so the catalogue is read one brand at a time). The same product can come back under
 * two terms; the refresh counts it once.
 */
// A brand whose page fails (a timeout, an odd answer) is skipped and the read goes on (2026-11-08: one timeout at AlfaMall and one odd
// answer at DigiMall stopped the whole store); only when every brand fails is the store's refresh a failure.
// A storefront page that times out or answers oddly is asked again, up to STOREFRONT_RETRIES times, after a pause that grows: AlfaMall's
// backend times out now and then under a long read. A refusal (HTTP 403 or 429) is an answer, and is never asked again.
export const STOREFRONT_RETRIES = 2;
export const STOREFRONT_RETRY_WAIT_MS = 5000;

async function answeredPage(store, url, { fetchJson, retryWaitMs }) {
  let error;
  for (let attempt = 0; attempt <= STOREFRONT_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryWaitMs * attempt));
    try {
      const body = await fetchJson(url);
      if (!Array.isArray(body?.results)) throw new Error(`${store.platform}: unexpected search response`);
      return { body };
    } catch (err) {
      error = err;
      if (/HTTP (403|429)\b/.test(err.message)) break;
    }
  }
  return { error };
}

export async function* storefrontCatalogue(store, terms, { fetchJson = politeFetchJson, onError, retryWaitMs = STOREFRONT_RETRY_WAIT_MS } = {}) {
  let failedTerms = 0;
  for (const term of terms) {
    let total = null; // the count the store reported, once a page has answered
    for (let page = 1; page <= MAX_PAGES; page++) {
      const search = new URLSearchParams({ ...store.params, q: term, page: String(page), limit: String(STOREFRONT_PER_PAGE) });
      const { body, error } = await answeredPage(store, `${store.apiUrl}?${search}`, { fetchJson, retryWaitMs });
      if (error) {
        onError?.({ term, page, error });
        if (total === null) {
          failedTerms += 1; // nothing known about this brand: leave it
          break;
        }
        // A page that still fails is skipped, not the rest of the brand (2026-11-09: one AlfaMall timeout ended a brand's read, and
        // with it Kenwood's 1,720 results stopped at 766; 39% of our AlfaMall listings went unrefreshed).
        if (page * STOREFRONT_PER_PAGE >= total) break;
        continue;
      }
      if (body.results.length === 0) break;
      yield safeMap(body.results, (item) => storefrontListing(store, item), store.platform);
      // Stop at the count the store reports, not at a short page: AlfaMall often answers 37 to 39 of 40 (2026-11-08: stopping at
      // the first short page read two pages of most brands, and found 21% of our AlfaMall listings).
      total = Math.min(Number(body.count) || 0, STOREFRONT_MAX_RESULTS);
      if (page * STOREFRONT_PER_PAGE >= total) break;
    }
  }
  if (terms.length > 0 && failedTerms === terms.length) throw new Error(`${store.platform}: every search failed`);
}
