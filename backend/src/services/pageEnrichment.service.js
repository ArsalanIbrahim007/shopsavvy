// pageEnrichment.service.js — reads a store's own product page once and records what it says that the listing title does
// not: whether a phone is PTA approved (ptaPage.service.js) and the colours it comes in (colourPage.service.js). The shopper
// then sees "PTA approved" instead of "PTA not stated", and can pick a colour for phones whose titles never name one.
//
// Conduct: a small number of pages per run (default 150), one at a time with a pause between them and the requests spread
// across stores, an honest User-Agent, and a listing is read again only after 14 days (2 days after a failed fetch). A page
// that cannot be fetched is recorded and skipped, never retried in a loop. Stores that turn away plain requests (iShopping,
// Paklap) go through the same headless browser their scrapers already use. The pages read are the ones the scrapers already
// list; nothing new is discovered or crawled.

import Listing from "../models/listing.model.js";
import { extractColourOptions } from "./colourPage.service.js";
import { extractPtaFromPage } from "./ptaPage.service.js";

// Where a colour choice is useful. PTA only applies to the first two.
export const PAGE_CATEGORIES = ["smartphone", "tablet", "smartwatch", "headphones", "laptop"];
export const PTA_CATEGORIES = ["smartphone", "tablet"];
export const DEFAULT_LIMIT = 150;
export const RECHECK_DAYS = 14;
export const RETRY_AFTER_FAILURE_DAYS = 2;
const DAY_MS = 24 * 3600 * 1000;
const NEEDS_BROWSER = new Set(["ishopping", "paklap"]);
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
 * @param {string[]} [options.stores]     only these stores (lowercase ids)
 * @param {string} [options.match]        only listings whose title contains this text (case-insensitive), to fill in one product first
 * @param {number} [options.now]          epoch ms, injectable for tests
 * @param {Function} [options.fetchPage]  (listing) => html, injectable for tests
 * @param {object} [options.model]        the Listing model, injectable for tests
 * @param {Function} [options.log]
 * @returns {Promise<{checked: number, approved: number, nonPta: number, unknown: number, withColours: number, failed: number, dry: boolean, results: object[]}>}
 */
export async function enrichFromPages({
  limit = DEFAULT_LIMIT, delayMs = 2500, dry = false, stores = null, match = null, now = Date.now(),
  fetchPage = defaultFetchPage, model = Listing, log = () => {},
} = {}) {
  const due = new Date(now - RECHECK_DAYS * DAY_MS);
  const filter = {
    productCategory: { $in: PAGE_CATEGORIES },
    isActive: true,
    $or: [{ pageCheckedAt: null }, { pageCheckedAt: { $lt: due } }],
  };
  if (stores?.length) filter.platform = { $in: stores };
  if (match) filter.title = { $regex: escapeRegex(String(match)), $options: "i" };

  const candidates = await model.find(filter).sort({ pageCheckedAt: 1, lastScrapedAt: -1 }).limit(Math.max(limit, 0)).lean();
  const queue = interleaveByStore(candidates);

  const summary = { checked: 0, approved: 0, nonPta: 0, unknown: 0, withColours: 0, failed: 0, dry, results: [] };

  for (const [index, listing] of queue.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);

    let pta;
    let colours;
    try {
      const html = await fetchPage(listing);
      pta = extractPtaFromPage(html, { productName: listing.title });
      colours = extractColourOptions(html);
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
    summary.results.push({ id: String(listing._id), platform: listing.platform, title: listing.title, status: ptaApplies ? pta.status : "n/a", evidence: pta.evidence, colours });
    log(`[pages] ${listing.platform} "${listing.title}": ${ptaApplies ? pta.status : "pta n/a"}${pta.evidence && ptaApplies ? ` (${pta.evidence})` : ""}; colours: ${colours.map((c) => c.colour).join(", ") || "none"}`);

    if (dry) continue;
    const set = { pageCheckedAt: new Date(now) };
    if (ptaApplies && pta.status !== "unknown") {
      set.ptaStatus = pta.status;
      set.ptaSource = "product_page";
    }
    if (colours.length > 0) set.colourOptions = colours; // a page that says nothing leaves an earlier answer alone
    await model.updateOne({ _id: listing._id }, { $set: set });
  }

  return summary;
}

/** The earlier name, kept so nothing that called it breaks. */
export const enrichPta = enrichFromPages;
