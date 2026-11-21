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
import { categoryCatalogue, productPagesCatalogue, megaCategories, megaCategoryUrl, parseMegaCategoryHtml, parseWooCategoryHtml, magentoCatalogue, shopifyCatalogue, storefrontCatalogue, wooCatalogue, wooCategoryUrl } from "../scrapers/catalogue.js";
import { parseIShoppingHtml } from "../scrapers/ishopping.scraper.js";
import { STORES as ADAPTER_STORES } from "../scrapers/stores.js";
import { priceOyeSection } from "../scrapers/priceoye.scraper.js";
import { sanitizePrices } from "./priceSanity.service.js";
import { canonicalSourceUrl, toListingDoc } from "./scraper.service.js";

export const BATCH_SIZE = 500;
// A listing missing from a store's whole catalogue is no longer sold there (MyMart, 2026-11-08: 90 of 200 listings, last seen in
// October, were gone from its catalogue), so it is marked out of stock and its old price stops counting as current. Only after a read
// of the WHOLE catalogue without an error (a Shopify or WooCommerce store read whole; a marketplace is read by brand and can miss things), and
// only when at least MIN_FOUND_SHARE of our listings were found: a read that went wrong must never mark a store's products gone.
export const MIN_FOUND_SHARE = 0.5;
// A whole-catalogue read that found fewer than COVERED_SHARE of our listings at its store is reported by the nightly scrape (the rest
// were not refreshed that night). A store read only in part, by collections (Al-Fatah: about half), is searched as well.
export const COVERED_SHARE = 0.9;
export const coversHeldListings = (stats) => stats.known === 0 || stats.matched / stats.known >= COVERED_SHARE;
// A storefront marketplace is read one brand at a time: the brands are the first words of the titles we hold for it, those with at
// least MIN_TERM_LISTINGS listings (a long tail of one-off words would cost a request each for almost nothing).
export const MIN_TERM_LISTINGS = 3;
export const MAX_TERMS = 200;

/** The stores whose catalogue can be read: the Shopify, WooCommerce and storefront ones (scrapers/stores.js). */
// Stores whose catalogue is read but whose searches have a scraper of their own (scrapers/index.js), so they are not in stores.js.
// Shophive (2026-11-09): its Magento GraphQL API lists all 7,920 products in 80 requests; searching kept it 51% fresh within a day.
// PriceOye (2026-11-18): read section by section and brand by brand ("mobiles/apple", "ac/haier": the first two parts of the addresses
// we hold there), where searching had kept 47% of its 7,300 listings checked within a day. A whole section ("mobiles") lists only its
// first 13 pages (376 of our 1,580 phones there, not even the iPhone 17 Pro); a brand's list holds all its current products. Its
// robots.txt allows "?page=" for every crawler.
export const CATALOGUE_ONLY_STORES = Object.freeze([
  { platform: "shophive", type: "magento", baseUrl: "https://www.shophive.com" },
  { platform: "priceoye", type: "priceoye", baseUrl: "https://priceoye.pk" },
  // iShopping (2026-11-18): its category pages, 150 products a page, parsed by its search scraper's parser (scrapers/catalogue.js
  // categoryCatalogue). Searching had kept 575 of its 4,516 listings checked within a day.
  {
    platform: "ishopping", type: "category", baseUrl: "https://www.ishopping.pk", parse: parseIShoppingHtml,
    // The top categories, and the sub-categories whose products a top page does not all show (the iPhone 18 Pro was only under
    // "mobiles/iphone-18-series"); TVs, watches and headphones sit in their own trees ("tv-s-and-entertainment", from a TV's breadcrumb).
    categories: [
      "mobiles", "mobiles/apple-iphone", "mobiles/iphone-18-series", "mobiles/iphone-17-series", "mobiles/android-smartphones", "mobiles/tablets",
      "mobiles/feature-phones", "mobiles/accessories", "laptops", "laptops/macbooks", "computers", "computers/accessories/monitors",
      "tv-s-and-entertainment", "smart-watches", "electronics", "electronics/bluetooth-earbuds", "home-living/large-appliances",
      "home-living/home-appliances",
    ],
  },
  // Mega.pk (2026-11-18): its category pages, read for the categories our listings come from (catalogue.js megaCategories).
  { platform: "mega", type: "category", baseUrl: "https://www.mega.pk", parse: parseMegaCategoryHtml, pageUrl: megaCategoryUrl, categories: megaCategories },
  // Paklap (2026-11-19): its robots.txt forbids its search; the listings we hold are refreshed from their product pages, which it
  // allows (catalogue.js productPagesCatalogue). Its bot check refuses our crawler at present, so the read stops after five refusals.
  // W11Stop was read the same way until 2026-11-19, then dropped: its pages time out or are gone; its listings fade after 15 days.
  { platform: "paklap", type: "pages", baseUrl: "https://www.paklap.pk" },
  // Subhan Electronics (2026-11-21): its robots.txt forbids /wp-json/ since 13 Nov (the API answered 403 every night, and its prices
  // stopped on 11 Nov). Read from its category pages instead, which robots.txt allows: the departments its 148 listings come from.
  {
    platform: "subhanelectronics", type: "category", baseUrl: "https://subhanelectronics.pk",
    parse: (html) => parseWooCategoryHtml("subhanelectronics", html), pageUrl: wooCategoryUrl("https://subhanelectronics.pk"),
    categories: [
      "led-tv", "gaming-tv", "air-conditioners", "washing-machine", "refrigerators", "deep-freezers", "upright-freezer",
      "microwave-oven", "kitchen-appliances", "small-domestic-appliances", "air-coolers-water-coolers", "water-dispenser", "geysers",
      "heaters", "dishwasher", "air-purifier", "garment-steamer",
    ],
  },
]);
export const CATALOGUE_STORES = [
  // a store whose search is off-limits (noSearch, scrapers/stores.js) is read only the way CATALOGUE_ONLY_STORES says
  ...ADAPTER_STORES.filter((store) => !store.noSearch && ["shopify", "woocommerce", "storefront"].includes(store.type)),
  ...CATALOGUE_ONLY_STORES,
];

/** The word a marketplace listing is read by: the first word of its title. */
export const storefrontTerm = (title) => String(title ?? "").toLowerCase().match(/[a-z][a-z0-9&+-]{1,}/)?.[0] ?? null;

/** The words to read a storefront marketplace by: the first word of the titles we hold for it, the most common first. */
// Stalest first (2026-11-18): AlfaMall's read takes longer than the night (1,170 pages in 150 minutes reached 63% of our listings), and
// most-listings-first read the same brands every night while the rest were never reached. A brand whose listings were checked
// longest ago now goes first, so each night carries on where the last stopped; the count breaks ties.
export async function storefrontTerms(platform, { listing = Listing } = {}) {
  const rows = await listing.find({ platform }, { title: 1, lastScrapedAt: 1 }).lean();
  const counts = new Map();
  const oldest = new Map();
  for (const { title, lastScrapedAt } of rows) {
    const word = storefrontTerm(title);
    if (!word) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    const at = new Date(lastScrapedAt ?? 0).getTime() || 0;
    if (!oldest.has(word) || at < oldest.get(word)) oldest.set(word, at);
  }
  return [...counts]
    .filter(([, n]) => n >= MIN_TERM_LISTINGS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TERMS)
    .sort((a, b) => oldest.get(a[0]) - oldest.get(b[0]) || b[1] - a[1])
    .map(([word]) => word);
}

function pagesOf(store, { fetchJson, terms, known, held = [], onError, onTermRead, onGone }) {
  if (store.type === "pages") return productPagesCatalogue(store, held, { onError, onGone });
  const options = { ...(fetchJson ? { fetchJson } : {}), onError, onTermRead };
  if (store.type === "shopify") return shopifyCatalogue(store, options);
  if (store.type === "woocommerce") {
    // the variable products we hold variations of (their addresses carry the variation: "<permalink>?attribute_...")
    const parents = new Set([...known].filter((url) => url.includes("?")).map((url) => url.split("?")[0]));
    return wooCatalogue(store, { ...options, expand: (permalink) => parents.has(canonicalSourceUrl(permalink)) });
  }
  if (store.type === "storefront") return storefrontCatalogue(store, terms, options);
  if (store.type === "magento") return magentoCatalogue(store, options);
  if (store.type === "priceoye") return priceOyeCatalogue(known, options);
  if (store.type === "category") {
    const categories = typeof store.categories === "function" ? store.categories(known) : store.categories;
    return categoryCatalogue({ ...store, categories }, { onError });
  }
  throw new Error(`${store.platform}: no catalogue reader for type ${store.type}`);
}

/** The section/brand lists of the PriceOye listings we hold (the first two parts of each address: "mobiles/apple"), largest first. */
export function priceOyeSections(known) {
  const counts = new Map();
  for (const url of known) {
    try {
      const [, section, brand, product] = new URL(url).pathname.split("/");
      if (section && brand && product) counts.set(`${section}/${brand}`, (counts.get(`${section}/${brand}`) ?? 0) + 1);
    } catch {
      // not an address
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([section]) => section);
}

async function* priceOyeCatalogue(known, { fetchHtml, onError } = {}) {
  for (const section of priceOyeSections(known)) yield* priceOyeSection(section, { ...(fetchHtml ? { fetch: fetchHtml } : {}), onError });
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
export async function refreshCatalogue(store, { fetchJson, terms, dryRun = false, onPage, deadline = null, listing = Listing, priceHistory = PriceHistory, now = () => new Date() } = {}) {
  const startedAt = Date.now();
  const held = await listing.find({ platform: store.platform }, { sourceUrl: 1, title: 1, lastScrapedAt: 1 }).lean();
  const known = new Set(held.map((row) => row.sourceUrl));
  const completeTerms = new Set(); // a marketplace's brand words read in full (storefrontCatalogue onTermRead)
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

  const pagesGone = []; // product pages the store answered 404 or 410 for (productPagesCatalogue)
  for await (const page of pagesOf(store, { fetchJson, terms: searchTerms, known, held, onGone: (urls) => pagesGone.push(...urls), onError, onTermRead: ({ term, complete }) => complete && completeTerms.add(term) })) {
    // The run's time limit: what was read is kept, nothing is marked gone (a read stopped early is not the whole store). AlfaMall's
    // read by brand takes over two hours with its retries; past the searches' budget it kept the nightly running until Task
    // Scheduler ended it, before its page check, with nothing logged (2026-11-10).
    if (deadline && Date.now() >= deadline) {
      stats.stoppedAtDeadline = true;
      break;
    }
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
  // A product page the store answered 404 or 410 for: the product was deleted (W11Stop, 2026-11-19). Gone as below, never by dry run.
  if (pagesGone.length) {
    stats.gone += pagesGone.length;
    if (!dryRun) {
      await listing.updateMany({ platform: store.platform, sourceUrl: { $in: pagesGone }, notInCatalogueSince: null }, { $set: { inStock: false, notInCatalogueSince: now() } });
    }
  }
  // Only a read of the whole store: not a marketplace read by brand, not chosen collections (Al-Fatah, 2026-11-08: its three
  // collections found 1,259 of our 2,444 listings, and the other 1,185, accessories and the like, were marked gone though still sold),
  // and not one a reader stopped early (an error, or a page limit reached: catalogue.js reports both through onError).
  // A marketplace (AlfaMall, DigiMall), read brand word by brand word: our listing of a word read in full that the read did not return
  // has been taken down by its seller (2026-11-18: of our 54 AlfaMall listings of the Samsung 55U8000F, many unseen for days, and the
  // "Afzal Corporation" offer shown as the lowest price led to a page that no longer existed). Only for a word whose read also found at
  // least MIN_FOUND_SHARE of our listings of it, so a search that answers oddly cannot take a brand down; never after the time limit.
  if (store.type === "storefront" && !stats.stoppedAtDeadline) {
    const byTerm = new Map();
    for (const row of held) {
      const word = storefrontTerm(row.title);
      if (!word || !completeTerms.has(word)) continue;
      if (!byTerm.has(word)) byTerm.set(word, []);
      byTerm.get(word).push(row.sourceUrl);
    }
    const gone = [];
    for (const urls of byTerm.values()) {
      const found = urls.filter((url) => seen.has(url)).length;
      if (found / urls.length >= MIN_FOUND_SHARE) gone.push(...urls.filter((url) => !seen.has(url)));
    }
    stats.gone = gone.length;
    stats.termsComplete = completeTerms.size;
    if (gone.length && !dryRun) {
      await listing.updateMany({ platform: store.platform, sourceUrl: { $in: gone }, notInCatalogueSince: null }, { $set: { inStock: false, notInCatalogueSince: now() } });
    }
  }
  // Category pages (iShopping, Mega) cover the categories read, not the store: refreshed, never marked gone by this rule.
  const wholeStore = store.type !== "storefront" && store.type !== "category" && store.type !== "pages" && !store.collections?.length;
  const complete = wholeStore && !stats.stoppedAtDeadline && stats.errors === 0 && stats.known > 0 && stats.matched / stats.known >= MIN_FOUND_SHARE;
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
