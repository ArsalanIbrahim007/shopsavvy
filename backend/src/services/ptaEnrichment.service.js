// ptaEnrichment.service.js — finds phones and tablets whose title does not say whether they are PTA approved, reads
// the store's own product page for the answer (ptaPage.service.js) and records it. The shopper then sees "PTA
// approved" where the store does say so, instead of "PTA not stated".
//
// Conduct: a small number of pages per run (default 60), one at a time with a pause between them and the
// requests spread across stores, an honest User-Agent, and a listing is looked at again only after 14 days (2 days
// after a failed fetch). A page that cannot be fetched is recorded and skipped, never retried in a loop. Stores
// that turn away plain requests (iShopping, Paklap) go through the same headless browser their scrapers already use.
// The pages read are the ones the scrapers already list; nothing new is discovered or crawled.

import Listing from "../models/listing.model.js";
import { extractPtaFromPage } from "./ptaPage.service.js";

export const PTA_CATEGORIES = ["smartphone", "tablet"];
export const DEFAULT_LIMIT = 60;
export const RECHECK_DAYS = 14;
export const RETRY_AFTER_FAILURE_DAYS = 2;
const DAY_MS = 24 * 3600 * 1000;
const NEEDS_BROWSER = new Set(["ishopping", "paklap"]);
const USER_AGENT = "ShopSavvyBot/1.0 (student price-comparison project; reads product pages to check PTA status)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * @param {number} [options.now]          epoch ms, injectable for tests
 * @param {Function} [options.fetchPage]  (listing) => html, injectable for tests
 * @param {object} [options.model]        the Listing model, injectable for tests
 * @param {Function} [options.log]
 * @returns {Promise<{checked: number, approved: number, nonPta: number, unknown: number, failed: number, dry: boolean, results: object[]}>}
 */
export async function enrichPta({
  limit = DEFAULT_LIMIT, delayMs = 2500, dry = false, stores = null, now = Date.now(),
  fetchPage = defaultFetchPage, model = Listing, log = () => {},
} = {}) {
  const due = new Date(now - RECHECK_DAYS * DAY_MS);
  const filter = {
    productCategory: { $in: PTA_CATEGORIES },
    ptaStatus: "unknown",
    isActive: true,
    $or: [{ ptaCheckedAt: null }, { ptaCheckedAt: { $lt: due } }],
  };
  if (stores?.length) filter.platform = { $in: stores };

  const candidates = await model.find(filter).sort({ ptaCheckedAt: 1, lastScrapedAt: -1 }).limit(Math.max(limit, 0)).lean();
  const queue = interleaveByStore(candidates);

  const summary = { checked: 0, approved: 0, nonPta: 0, unknown: 0, failed: 0, dry, results: [] };

  for (const [index, listing] of queue.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);

    let outcome;
    try {
      const html = await fetchPage(listing);
      outcome = extractPtaFromPage(html, { productName: listing.title });
    } catch (err) {
      summary.failed += 1;
      log(`[pta] ${listing.platform} "${listing.title}": ${err.message}`);
      // Looked at again in a couple of days, not at the front of the next run.
      if (!dry) await model.updateOne({ _id: listing._id }, { $set: { ptaCheckedAt: new Date(now - (RECHECK_DAYS - RETRY_AFTER_FAILURE_DAYS) * DAY_MS) } });
      summary.results.push({ id: String(listing._id), platform: listing.platform, title: listing.title, status: "failed", evidence: err.message });
      continue;
    }

    summary.checked += 1;
    if (outcome.status === "pta_approved") summary.approved += 1;
    else if (outcome.status === "non_pta") summary.nonPta += 1;
    else summary.unknown += 1;
    summary.results.push({ id: String(listing._id), platform: listing.platform, title: listing.title, status: outcome.status, evidence: outcome.evidence });
    log(`[pta] ${listing.platform} "${listing.title}": ${outcome.status}${outcome.evidence ? ` (${outcome.evidence})` : ""}`);

    if (dry) continue;
    const set = { ptaCheckedAt: new Date(now) };
    if (outcome.status !== "unknown") {
      set.ptaStatus = outcome.status;
      set.ptaSource = "product_page";
    }
    await model.updateOne({ _id: listing._id }, { $set: set });
  }

  return summary;
}
