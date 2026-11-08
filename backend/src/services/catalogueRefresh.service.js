// catalogueRefresh.service.js — keeps the prices we hold fresh by reading whole store catalogues (scrapers/catalogue.js) instead of
// searching one product at a time.
//
// Only listings we already hold are updated: a store's catalogue also holds what the site is not about (Al-Fatah sells groceries),
// and new products keep arriving through searches, which choose them by category. An updated listing goes through the same steps as
// a searched one (scraper.service.js runScrapersAndSave): the price sanity check, the listing written with toListingDoc, and a price
// history entry; only in batches (bulkWrite), because one round trip per listing to a remote database took about an hour a night.
//
//   refreshCatalogue(store)  -> { pages, items, matched, updated, skippedPrice, historyAppended, durationMs }

import Listing from "../models/listing.model.js";
import PriceHistory from "../models/priceHistory.model.js";
import { shopifyCatalogue, storefrontCatalogue, wooCatalogue } from "../scrapers/catalogue.js";
import { STORES as ADAPTER_STORES } from "../scrapers/stores.js";
import { sanitizePrices } from "./priceSanity.service.js";
import { canonicalSourceUrl, toListingDoc } from "./scraper.service.js";

export const BATCH_SIZE = 500;
// A listing missing from a store's whole catalogue is no longer sold there (MyMart, 2026-11-08: 90 of 200 listings, last seen in
// October, were gone from its catalogue), so it is marked out of stock and its old price stops counting as current. Only after a read
// of the WHOLE catalogue without an error (a Shopify or WooCommerce store read whole; a marketplace is read by brand and can miss things), and
// only when at least MIN_FOUND_SHARE of our listings were found: a read that went wrong must never mark a store's products gone.
export const MIN_FOUND_SHARE = 0.5;
// The nightly scrape skips the searches at a store whose catalogue was read, but only when the read found at least COVERED_SHARE of
// our listings there: Al-Fatah's three collections find about half, and the other half are still refreshed by searching.
export const COVERED_SHARE = 0.9;
export const coversHeldListings = (stats) => stats.known === 0 || stats.matched / stats.known >= COVERED_SHARE;
// A storefront marketplace is read one brand at a time: the brands are the first words of the titles we hold for it, those with at
// least MIN_TERM_LISTINGS listings (a long tail of one-off words would cost a request each for almost nothing).
export const MIN_TERM_LISTINGS = 3;
export const MAX_TERMS = 200;

/** The stores whose catalogue can be read: the Shopify, WooCommerce and storefront ones (scrapers/stores.js). */
export const CATALOGUE_STORES = ADAPTER_STORES.filter((store) => ["shopify", "woocommerce", "storefront"].includes(store.type));

/** The words to read a storefront marketplace by: the first word of the titles we hold for it, the most common first. */
export async function storefrontTerms(platform, { listing = Listing } = {}) {
  const rows = await listing.find({ platform }, { title: 1 }).lean();
  const counts = new Map();
  for (const { title } of rows) {
    const word = String(title ?? "").toLowerCase().match(/[a-z][a-z0-9&+-]{1,}/)?.[0];
    if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= MIN_TERM_LISTINGS).sort((a, b) => b[1] - a[1]).slice(0, MAX_TERMS).map(([word]) => word);
}

function pagesOf(store, { fetchJson, terms, known, onError }) {
  const options = { ...(fetchJson ? { fetchJson } : {}), onError };
  if (store.type === "shopify") return shopifyCatalogue(store, options);
  if (store.type === "woocommerce") {
    // the variable products we hold variations of (their addresses carry the variation: "<permalink>?attribute_...")
    const parents = new Set([...known].filter((url) => url.includes("?")).map((url) => url.split("?")[0]));
    return wooCatalogue(store, { ...options, expand: (permalink) => parents.has(canonicalSourceUrl(permalink)) });
  }
  if (store.type === "storefront") return storefrontCatalogue(store, terms, options);
  throw new Error(`${store.platform}: no catalogue reader for type ${store.type}`);
}

/**
 * Reads one store's catalogue and updates the listings we hold from it.
 *
 * @param {object} store  an entry of CATALOGUE_STORES
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  injectable for tests
 * @param {string[]} [options.terms]      a storefront's search words (default: storefrontTerms)
 * @param {boolean} [options.dryRun]      count what would be updated, write nothing
 * @param {Function} [options.onPage]     ({ pages, items, matched }) after each page
 */
export async function refreshCatalogue(store, { fetchJson, terms, dryRun = false, onPage, listing = Listing, priceHistory = PriceHistory, now = () => new Date() } = {}) {
  const startedAt = Date.now();
  const known = new Set((await listing.find({ platform: store.platform }, { sourceUrl: 1 }).lean()).map((row) => row.sourceUrl));
  const searchTerms = store.type === "storefront" ? terms ?? (await storefrontTerms(store.platform, { listing })) : undefined;
  const stats = { platform: store.platform, known: known.size, terms: searchTerms?.length, pages: 0, items: 0, matched: 0, updated: 0, skippedPrice: 0, historyAppended: 0, errors: 0 };
  const onError = ({ error }) => {
    stats.errors += 1;
    if (stats.errors <= 3) console.warn(`[catalogue] ${store.platform}: ${error.message} (skipped, the read goes on)`);
  };
  const seen = new Set();
  let pending = [];

  async function flush() {
    if (pending.length === 0 || dryRun) {
      if (dryRun) stats.updated += pending.length;
      pending = [];
      return;
    }
    const batch = pending;
    pending = [];
    await listing.bulkWrite(
      batch.map((item) => ({ updateOne: { filter: { platform: item.platform, sourceUrl: item.sourceUrl }, update: { $set: toListingDoc(item) } } })),
      { ordered: false },
    );
    const history = await priceHistory.recordPrices(batch, now());
    stats.updated += batch.length;
    stats.historyAppended += history.appended;
  }

  for await (const page of pagesOf(store, { fetchJson, terms: searchTerms, known, onError })) {
    stats.pages += 1;
    for (const scraped of page) {
      const sourceUrl = canonicalSourceUrl(scraped.sourceUrl);
      if (seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
      stats.items += 1;
      if (!known.has(sourceUrl)) continue; // not a listing we hold: searches decide what the site lists
      stats.matched += 1;
      const checked = sanitizePrices(scraped);
      if (!checked.ok) {
        stats.skippedPrice += 1;
        continue;
      }
      pending.push({ ...scraped, sourceUrl, price: checked.price, originalPrice: checked.originalPrice });
      if (pending.length >= BATCH_SIZE) await flush();
    }
    onPage?.({ pages: stats.pages, items: stats.items, matched: stats.matched });
  }
  await flush();

  stats.gone = 0;
  // Only a read of the whole store: not a marketplace read by brand, not chosen collections (Al-Fatah, 2026-11-08: its three
  // collections found 1,259 of our 2,444 listings, and the other 1,185, accessories and the like, were marked gone though still sold),
  // and not one a reader stopped early (an error, or a page limit reached: catalogue.js reports both through onError).
  const wholeStore = store.type !== "storefront" && !store.collections?.length;
  const complete = wholeStore && stats.errors === 0 && stats.known > 0 && stats.matched / stats.known >= MIN_FOUND_SHARE;
  if (complete) {
    const gone = [...known].filter((url) => !seen.has(url));
    stats.gone = gone.length;
    if (gone.length && !dryRun) {
      await listing.updateMany({ platform: store.platform, sourceUrl: { $in: gone }, inStock: { $ne: false } }, { $set: { inStock: false, notInCatalogueSince: now() } });
    }
  }
  stats.durationMs = Date.now() - startedAt;
  return stats;
}
