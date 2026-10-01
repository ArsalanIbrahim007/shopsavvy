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

import { scrapeShopifySearch } from "./shopify.scraper.js";
import { scrapeWooSearch } from "./woocommerce.scraper.js";

export const STORES = [
  { platform: "mistore", type: "shopify", baseUrl: "https://mistore.pk" },
  { platform: "mymart", type: "shopify", baseUrl: "https://mymart.pk" },
  { platform: "alfatah", type: "shopify", baseUrl: "https://alfatah.pk" },
  { platform: "xcessorieshub", type: "woocommerce", baseUrl: "https://xcessorieshub.com" },
  { platform: "eezepc", type: "woocommerce", baseUrl: "https://eezepc.com" },
  { platform: "ledshop", type: "woocommerce", baseUrl: "https://ledshop.pk" },
];

const ADAPTERS = { shopify: scrapeShopifySearch, woocommerce: scrapeWooSearch };

/**
 * One task per store, in the shape index.js runs: { platform, fn }.
 * @param {string} query
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  injectable for tests
 */
export function storeTasks(query, options = {}) {
  return STORES.map((store) => ({
    platform: store.platform,
    fn: () => ADAPTERS[store.type](store, query, options),
  }));
}
