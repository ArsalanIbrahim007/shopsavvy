// storefront.scraper.js — one adapter for the marketplaces built on the same storefront platform (AlfaMall, Faysal DigiMall: their
// pictures come from cdn.comverseglobal.com). Each store's own search page asks its backend for products with a plain GET to
// /storefront/search_products and gets JSON back; this asks the same question, so there is no page to download or markup to
// keep up with. The backend is not a documented API: if its answer changes shape, this throws and the store breaker pauses the
// store (storeBreaker.js) rather than saving anything wrong.
//
// Both stores are marketplaces: a product is sold by one of their sellers (shown on their pages), and searches rank accessories
// highly, so one wide page is read, and a second only while fewer than MIN_PRODUCTS results look like more than an accessory. A
// product covering several variants (an iPhone in three capacities) is one result with a price range; it is saved at its lowest
// price, as Shopify's search reports it, and grouping places a title that names no capacity by price.

import { makeListing } from "./scraper.schema.js";
import { cleanText, parsePrice, safeMap } from "./scraper.utils.js";
import { fetchJson as politeFetchJson } from "./politeJson.js";

const PER_PAGE = 40;
const MAX_PAGES = 2;
const MIN_PRODUCTS = 2;

// Marketplace sellers list things that are not a product at a price (found in live searches on 2026-10-22):
//  - a service named after a phone: "PTA Approval Service iPhone 17 Pro" at PKR 218,899 would otherwise be the cheapest iPhone 17 Pro;
//  - an instalment plan priced at the monthly payment: "Apple Iphone 17 Pro Max 512 | ... On Easy Monthly Installment" at PKR 27,649,
//    with the real price, PKR 612,799, as its "original price".
const SERVICE = /\bPTA\b.*\b(service|registration|tax)\b|\b(service|registration)\b.*\bPTA\b/i;
const INSTALMENT_WORDS = /instal+ments?|monthly|per month|\bemi\b|down ?payment|advance/i;
const INSTALMENT_RATIO = 0.4; // an instalment-plan listing priced under 40% of its stated full price is quoting a payment
const DEPOSIT_RATIO = 0.2; // any listing under 20% of its stated full price: a deposit or a typo, not an 80%-off phone

/** True when a result is a service, or its price is an instalment or deposit rather than the price of the product. */
export function notAPrice(title, price, originalPrice) {
  if (SERVICE.test(title)) return true;
  if (!(originalPrice > price)) return false;
  return price < originalPrice * DEPOSIT_RATIO || (INSTALMENT_WORDS.test(title) && price < originalPrice * INSTALMENT_RATIO);
}

/** True when the store files the result under accessories, cases or covers (its own category path). */
const isAccessory = (item) =>
  (item.category ?? []).some((c) => /accessor|acessor|cases?-covers?|covers?|chargers?|cables?/i.test(String(c.handle ?? c.title ?? "")));

/**
 * @param {object} store
 * @param {string} store.platform     the platform id listings are saved under
 * @param {string} store.baseUrl      the shop, e.g. "https://alfamall.com"
 * @param {string} store.apiUrl       its backend's search address
 * @param {object} store.params       what the store's own page sends with each search to name the store
 * @param {string} store.productPath  how product pages are addressed: "/" + handle, or "/product/" + handle
 * @param {string} query
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  (url) => parsed JSON; injectable for tests
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
export async function scrapeStorefrontSearch({ platform, baseUrl, apiUrl, params, productPath }, query, { fetchJson = politeFetchJson } = {}) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const search = new URLSearchParams({ ...params, q: query, page: String(page), limit: String(PER_PAGE) });
    const body = await fetchJson(`${apiUrl}?${search}`);
    if (!Array.isArray(body?.results)) throw new Error(`${platform}: unexpected search response`);
    items.push(...body.results);
    const products = items.filter((item) => !isAccessory(item)).length;
    if (body.results.length < PER_PAGE || products >= MIN_PRODUCTS) break;
  }

  return safeMap(
    items,
    (item) => {
      const title = cleanText(item.title);
      const handle = String(item.handle ?? "").trim();
      if (!title || !handle || /[\s/?#]/.test(handle)) return null;

      const price = parsePrice(item.variant_detail?.discounted_price);
      if (!(price > 0)) return null;
      const was = parsePrice(item.variant_detail?.original_price);
      if (notAPrice(title, price, was)) return null;
      const image = Array.isArray(item.images) ? item.images.find((src) => /^https:\/\//.test(String(src))) : null;
      return makeListing({
        platform,
        sourceUrl: `${baseUrl}${productPath}${encodeURIComponent(handle)}`,
        title,
        price,
        originalPrice: was > price ? was : null,
        imageUrl: image ?? null,
        inStock: item.sold_out !== true,
      });
    },
    platform
  );
}
