// stores.js — the stores searched through a platform adapter rather than a store-specific scraper. Adding one is a line
// here (and its trust value in ranking/scores/trustScore.js), once its robots.txt and search endpoint have been checked.
//
// Checked 2026-10-01 (robots.txt allows a general crawler on the search path, and the endpoint answers without a login):
//   mistore.pk        Shopify   Xiaomi's official store in Pakistan
//   mymart.pk         Shopify   Xiaomi / Redmi / ZTE and accessories (its robots.txt points agents at its own agent endpoint;
//                               we use the public storefront search, at one request per search)
//   alfatah.pk        Shopify   Al-Fatah: TVs, appliances, some phones and laptops
//   xcessorieshub.com WooCommerce  phones, tablets and a large accessories range
//   eezepc.com        WooCommerce  phones, laptops, accessories
//   ledshop.pk        WooCommerce  TVs
// Not added: galaxy.pk (its search page renders results in the browser, so the server sends unrelated products), mobilemall.pk
// (no public product API), alfamall.pk (the domain is parked), and stores whose robots.txt or bot checks say no.
//
// Checked 2026-10-22 (R1, store expansion; the stores Qeemat lists, and others of the kind). Each passed three checks: robots.txt
// lets a general crawler use the search path, the public endpoint answers with real products for a real search, and the store's
// terms page (where there is one) says nothing against automated access:
//   techroid.com             WooCommerce  phones (one of Qeemat's largest sources)
//   subhanelectronics.pk     WooCommerce  TVs
//   jalalelectronics.com     Shopify      TVs
//   japanelectronics.com.pk  Shopify      TVs (titles like "Samsung LED 55\"" do not say "TV": the category reader misses them)
//   zerolifestyle.co         Shopify      Zero's own smartwatches and earbuds
//   audionic.co              Shopify      Audionic's own earbuds, headphones and speakers
//   ronin.pk                 Shopify      Ronin's own earbuds, headphones and watches
//   baseus.pk                Shopify      Baseus earbuds and accessories
//   infinix.pk               WooCommerce  Infinix phones (no terms page at the usual addresses)
// Not added 2026-10-22: mabdullah.pk, pakref.com and friendshome.pk (their terms forbid using the site "to spider, crawl, or
// scrape"); shoppingjin.pk, pakbyte.pk, allmytech.pk and highfy.pk (robots.txt disallows the search path); naheed.pk, czone.com.pk
// and jazz.com.pk (refuse requests: 403); rbtechngames.com (sells PC parts and accessories, none of our categories); stores on
// Magento (galaxy.pk, alfamall.com, digimall.faysalbank.com, homecart.pk), which need an adapter of their own.
//
// `sells` (optional): the query categories a single-brand or single-range store is asked about. Its search is not sent for a
// query of another known category (Audionic is not asked about an iPhone every night); a query whose category is unknown
// ("other", which is also what "infinix hot 60" reads as) goes to every store. A store without `sells` is asked about everything.

import { detectQueryCategory } from "./productCategory.js";
import { scrapeShopifySearch } from "./shopify.scraper.js";
import { scrapeWooSearch } from "./woocommerce.scraper.js";

export const STORES = [
  { platform: "mistore", type: "shopify", baseUrl: "https://mistore.pk" },
  { platform: "mymart", type: "shopify", baseUrl: "https://mymart.pk" },
  { platform: "alfatah", type: "shopify", baseUrl: "https://alfatah.pk" },
  { platform: "xcessorieshub", type: "woocommerce", baseUrl: "https://xcessorieshub.com" },
  { platform: "eezepc", type: "woocommerce", baseUrl: "https://eezepc.com" },
  { platform: "ledshop", type: "woocommerce", baseUrl: "https://ledshop.pk" },
  { platform: "techroid", type: "woocommerce", baseUrl: "https://techroid.com" },
  { platform: "subhanelectronics", type: "woocommerce", baseUrl: "https://subhanelectronics.pk", sells: ["tv"] },
  { platform: "jalalelectronics", type: "shopify", baseUrl: "https://jalalelectronics.com", sells: ["tv"] },
  { platform: "japanelectronics", type: "shopify", baseUrl: "https://japanelectronics.com.pk", sells: ["tv"] },
  { platform: "zerolifestyle", type: "shopify", baseUrl: "https://zerolifestyle.co", sells: ["smartwatch", "headphones"] },
  { platform: "audionic", type: "shopify", baseUrl: "https://audionic.co", sells: ["headphones", "smartwatch"] },
  { platform: "ronin", type: "shopify", baseUrl: "https://ronin.pk", sells: ["headphones", "smartwatch"] },
  { platform: "baseus", type: "shopify", baseUrl: "https://baseus.pk", sells: ["headphones"] },
  { platform: "infinix", type: "woocommerce", baseUrl: "https://infinix.pk", sells: ["smartphone", "tablet", "laptop"] },
];

const ADAPTERS = { shopify: scrapeShopifySearch, woocommerce: scrapeWooSearch };

/** True when `store` is to be asked about `query` (see `sells` above). */
export function storeSells(store, query) {
  if (!store.sells) return true;
  const { category } = detectQueryCategory(String(query ?? "").toLowerCase().trim());
  return category === "other" || store.sells.includes(category);
}

/**
 * One task per store that sells what is searched for, in the shape index.js runs: { platform, fn }.
 * @param {string} query
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  injectable for tests
 */
export function storeTasks(query, options = {}) {
  return STORES.filter((store) => storeSells(store, query)).map((store) => ({
    platform: store.platform,
    fn: () => ADAPTERS[store.type](store, query, options),
  }));
}
