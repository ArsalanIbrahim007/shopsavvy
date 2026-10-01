// shopify.scraper.js — one adapter for every store built on Shopify (Mi Store, MyMart, Al-Fatah...). Shopify publishes a
// product search for its storefront themes at /search/suggest.json; this reads that, so there is no page to download
// and no markup to keep up with. It returns at most 10 products per search (Shopify's limit), ranked by the store's own
// relevance; the shared relevance filter in index.js then drops what is not the product asked for.

import { makeListing } from "./scraper.schema.js";
import { cleanText, parsePrice, safeMap } from "./scraper.utils.js";
import { fetchJson as politeFetchJson } from "./politeJson.js";

const LIMIT = 10;

const absolute = (baseUrl, value) => {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value.startsWith("http") ? value : `${baseUrl}${value}`;
};

/**
 * @param {object} store
 * @param {string} store.platform  the platform id listings are saved under
 * @param {string} store.baseUrl   e.g. "https://mistore.pk"
 * @param {string} query
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  (url) => parsed JSON; injectable for tests
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
export async function scrapeShopifySearch({ platform, baseUrl }, query, { fetchJson = politeFetchJson } = {}) {
  const url = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(query)}&resources%5Btype%5D=product&resources%5Blimit%5D=${LIMIT}`;
  const body = await fetchJson(url);
  const products = body?.resources?.results?.products;
  if (!Array.isArray(products)) throw new Error(`${platform}: unexpected search response`);

  return safeMap(
    products,
    (product) => {
      const title = cleanText(product.title);
      const path = String(product.url ?? "").split("?")[0]; // the suggest endpoint adds tracking parameters
      if (!title || !path) return null;

      const price = parsePrice(product.price);
      if (!(price > 0)) return null; // no price (a product the store lists without one): nothing to compare
      const compareAt = parsePrice(product.compare_at_price_max);
      return makeListing({
        platform,
        sourceUrl: absolute(baseUrl, path),
        title,
        price,
        originalPrice: compareAt > price ? compareAt : null,
        imageUrl: absolute(baseUrl, product.image) ?? null,
        inStock: product.available !== false,
      });
    },
    platform
  );
}
