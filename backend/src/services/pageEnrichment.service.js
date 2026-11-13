// pageEnrichment.service.js — reads a store's own product page once and records what it says that the listing title does
// not: whether a phone is PTA approved (ptaPage.service.js), the colours it comes in (colourPage.service.js) and what buyers
// rated it (ratingPage.service.js). The shopper then sees "PTA approved" instead of "PTA not stated", can pick a colour for phones
// whose titles never name one, and sees how the store's own buyers rated the product.
//
// Conduct: a small number of pages per run (default 150), one at a time with a pause between them and the requests spread
// across stores, an honest User-Agent, and a listing is read again only after 14 days (2 days after a failed fetch). A page
// that cannot be fetched is recorded and skipped, never retried in a loop. Stores that turn away plain requests (iShopping,
// Paklap) go through the same headless browser their scrapers already use. The pages read are the ones the scrapers already
// list; nothing new is discovered or crawled.

import { DISABLED_PLATFORMS } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { extractColourOptions } from "./colourPage.service.js";
import { extractConditionFromPage } from "./conditionPage.service.js";
import { extractPagePrice } from "./pagePrice.service.js";
import { extractPtaFromPage } from "./ptaPage.service.js";
import { extractJudgeMeRating, extractPriceOyeRating } from "./ratingPage.service.js";
import { readSpecSheet, SPEC_CATEGORIES } from "./specsEngine.service.js";

// Where a colour choice is useful. PTA only applies to the first two.
export const PAGE_CATEGORIES = ["smartphone", "tablet", "smartwatch", "headphones", "laptop"];
export const PTA_CATEGORIES = ["smartphone", "tablet"];
export const DEFAULT_LIMIT = 150;
export const RECHECK_DAYS = 14;
export const RETRY_AFTER_FAILURE_DAYS = 2;
const DAY_MS = 24 * 3600 * 1000;
const NEEDS_BROWSER = new Set(["ishopping", "paklap"]);
// How to read a rating from each store whose pages were checked (see ratingPage.service.js for what was found, and why Mega, iShopping
// and the others are not here). A store joins this list after the same check: pages of different products, compared with what the
// page shows a shopper.
export const RATING_READERS = new Map([
  ["priceoye", extractPriceOyeRating],
  // Shopify stores whose product pages show Judge.me reviews (checked 2026-11-09)
  ...["audionic", "zerolifestyle", "ronin", "baseus", "mistore", "mymart"].map((store) => [store, extractJudgeMeRating]),
]);
// Stores whose pages are read for a used phone sold under a new phone's title (conditionPage.service.js). iShopping: its 19 iPhone
// pages read 2026-11-12, the 10 used ones (5 or 6 signs each) and none of the 9 new ones. Another store joins after the same check.
export const CONDITION_STORES = new Set(["ishopping"]);
const USER_AGENT = "ShopSavvyBot/1.0 (student price-comparison project; reads product pages for PTA status and colours)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Text that matches itself literally inside a regular expression. */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Puts the listings in an order that never asks one store for two pages in a row while another store is waiting. */
export function interleaveByStore(listings) {
  const queues = new Map();
  for (const listing of listings) {
    const key = String(listing.platform).toLowerCase();
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(listing);
  }
  const out = [];
  while (out.length < listings.length) {
    for (const queue of queues.values()) if (queue.length) out.push(queue.shift());
  }
  return out;
}

/** Downloads a product page: a plain request, or the headless browser for the stores that refuse one. */
export async function defaultFetchPage(listing) {
  const url = listing.productUrl || listing.sourceUrl;
  if (!/^https?:\/\//i.test(url ?? "")) throw new Error("no usable address");

  if (NEEDS_BROWSER.has(String(listing.platform).toLowerCase())) {
    const { fetchHtmlWithBrowser } = await import("../scrapers/playwrightFetch.js");
    return fetchHtmlWithBrowser(url, { timeout: 25000 });
  }

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * @param {object} [options]
 * @param {number} [options.limit]        most pages to read in this run
 * @param {number} [options.delayMs]      pause between two pages
 * @param {boolean} [options.dry]         read and report, but save nothing
 * @param {boolean} [options.again]       include pages read within the last 14 days (oldest first), not only the ones that are due
 * @param {string[]} [options.stores]     only these stores (lowercase ids)
 * @param {string} [options.match]        only listings whose title contains this text (case-insensitive), to fill in one product first
 * @param {string[]} [options.categories] only these of PAGE_CATEGORIES (e.g. the spec categories, to fill in specifications first)
 * @param {string[]} [options.ids]        exactly these listings, in this order, read again whenever they were last read
 *                                        (maintenance/fill-specs.js: the most compared products first)
 * @param {number} [options.now]          epoch ms, injectable for tests
 * @param {Function} [options.fetchPage]  (listing) => html, injectable for tests
 * @param {Function} [options.readSpecs]  (platform, html, {log}) => canonical sheet | null: the Specs engine (specsEngine.service.js),
 *                                        which answers null until Muzammil's engine is merged; injectable for tests
 * @param {object} [options.model]        the Listing model, injectable for tests
 * @param {Function} [options.log]
 * @returns {Promise<{checked: number, approved: number, nonPta: number, unknown: number, withColours: number, withSpecs: number, failed: number, dry: boolean, results: object[]}>}
 */
export async function enrichFromPages({
  limit = DEFAULT_LIMIT, delayMs = 2500, dry = false, again = false, stores = null, match = null, categories = null, ids = null, now = Date.now(),
  fetchPage = defaultFetchPage, readSpecs = readSpecSheet, model = Listing, log = () => {},
} = {}) {
  const due = new Date(now - RECHECK_DAYS * DAY_MS);
  const filter = {
    productCategory: { $in: categories?.length ? PAGE_CATEGORIES.filter((c) => categories.includes(c)) : PAGE_CATEGORIES },
    isActive: true,
  };
  // `again`: also the pages read lately (oldest first), to fill in a field that did not exist when they were read.
  if (!again) filter.$or = [{ pageCheckedAt: null }, { pageCheckedAt: { $lt: due } }];
  // A switched-off store's pages are never read (its listings are hidden everywhere else too: config/platforms.js).
  const allowed = (stores?.length ? stores : null)?.filter((s) => !DISABLED_PLATFORMS.includes(s));
  filter.platform = allowed ? { $in: allowed } : { $nin: DISABLED_PLATFORMS };
  if (match) filter.title = { $regex: escapeRegex(String(match)), $options: "i" };
  if (ids?.length) {
    filter._id = { $in: ids };
    delete filter.$or;
    delete filter.productCategory; // a page asked for by id is read whatever its category (an appliance's price, pagePrice.service.js)
  }

  const found = await model.find(filter).sort({ pageCheckedAt: 1, lastScrapedAt: -1 }).limit(Math.max(limit, 0)).lean();
  // Given ids keep their order (the most compared product first); otherwise the oldest-read page goes first.
  const order = ids?.length ? new Map(ids.map((id, i) => [String(id), i])) : null;
  const candidates = order ? [...found].sort((a, b) => (order.get(String(a._id)) ?? 1e9) - (order.get(String(b._id)) ?? 1e9)) : found;
  const queue = interleaveByStore(candidates);

  const summary = { checked: 0, approved: 0, nonPta: 0, unknown: 0, withColours: 0, withRating: 0, withSpecs: 0, failed: 0, dry, results: [] };

  for (const [index, listing] of queue.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);

    let pta;
    let colours;
    let rated; // set below, or the listing is skipped by the catch
    let sheet = null;
    let used = { condition: null, evidence: [] };
    let pagePrice; // set below, or the listing is skipped by the catch
    try {
      const html = await fetchPage(listing);
      pta = extractPtaFromPage(html, { productName: listing.title });
      colours = extractColourOptions(html);
      pagePrice = extractPagePrice(listing.platform, html);
      // A used phone sold under a new phone's title (iShopping, 2026-11-12): only its page says so (conditionPage.service.js).
      if (PTA_CATEGORIES.includes(listing.productCategory) && CONDITION_STORES.has(String(listing.platform).toLowerCase())) used = extractConditionFromPage(html);
      rated = RATING_READERS.get(String(listing.platform).toLowerCase())?.(html) ?? null;
      // The Specs engine guards itself: a parser error is logged and gives null, never a failed page.
      if (SPEC_CATEGORIES.includes(listing.productCategory)) sheet = await readSpecs(listing.platform, html, { log });
    } catch (err) {
      summary.failed += 1;
      log(`[pages] ${listing.platform} "${listing.title}": ${err.message}`);
      // Read again in a couple of days, not at the front of the next run.
      if (!dry) await model.updateOne({ _id: listing._id }, { $set: { pageCheckedAt: new Date(now - (RECHECK_DAYS - RETRY_AFTER_FAILURE_DAYS) * DAY_MS) } });
      summary.results.push({ id: String(listing._id), platform: listing.platform, title: listing.title, status: "failed", evidence: err.message, colours: [] });
      continue;
    }

    summary.checked += 1;
    // PTA is only worked out, and only saved, for phones and tablets whose title did not already say.
    const ptaApplies = PTA_CATEGORIES.includes(listing.productCategory) && (listing.ptaStatus ?? "unknown") === "unknown";
    if (ptaApplies) {
      if (pta.status === "pta_approved") summary.approved += 1;
      else if (pta.status === "non_pta") summary.nonPta += 1;
      else summary.unknown += 1;
    }
    if (colours.length > 0) summary.withColours += 1;
    if (rated) summary.withRating += 1;
    if (sheet) summary.withSpecs += 1;
    summary.results.push({ id: String(listing._id), platform: listing.platform, title: listing.title, status: ptaApplies ? pta.status : "n/a", evidence: pta.evidence, colours, rating: rated, specs: sheet, condition: used.condition });
    log(`[pages] ${listing.platform} "${listing.title}": ${ptaApplies ? pta.status : "pta n/a"}${pta.evidence && ptaApplies ? ` (${pta.evidence})` : ""}; colours: ${colours.map((c) => c.colour).join(", ") || "none"}${rated ? `; rating: ${rated.rating} (${rated.reviewCount})` : ""}${sheet ? `; specs: ${Object.keys(sheet).length} fields` : ""}${used.condition ? `; used (${used.evidence.join(", ")})` : ""}${pagePrice ? `; page price ${pagePrice}${pagePrice !== listing.price ? ` (listed ${listing.price})` : ""}` : ""}`);

    if (dry) continue;
    const set = { pageCheckedAt: new Date(now) };
    if (ptaApplies && pta.status !== "unknown") {
      set.ptaStatus = pta.status;
      set.ptaSource = "product_page";
    }
    if (colours.length > 0) set.colourOptions = colours; // a page that says nothing leaves an earlier answer alone
    if (rated) Object.assign(set, rated);
    if (sheet) set.specSheet = sheet; // likewise: a page whose specifications could not be read keeps the earlier sheet
    // The condition the page shows: a used phone becomes "used"; one the page earlier called used and now shows as new goes back.
    // A condition the title itself states ("Used", "Refurbished") is never touched (conditionSource "title" or none).
    if (pagePrice) Object.assign(set, { pagePrice, pagePriceAt: new Date(now) });
    if (used.condition && (listing.condition ?? "new") === "new") Object.assign(set, { condition: used.condition, conditionSource: "product_page" });
    else if (!used.condition && listing.conditionSource === "product_page") Object.assign(set, { condition: "new", conditionSource: null });
    await model.updateOne({ _id: listing._id }, { $set: set });
  }

  return summary;
}

/** The earlier name, kept so nothing that called it breaks. */
export const enrichPta = enrichFromPages;
