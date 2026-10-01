// integrity.service.js — the numbers behind "how we keep prices honest": what ShopSavvy's own checks found in the data it holds right
// now, and how the trained models scored on pairs they never saw. Everything is counted, nothing is estimated or filled in.
//
// The live counts come from the grouped catalog of each category (the same cached, grouped and checked offers the browse pages
// show, see catalogFeed.service.js), so there is no second grouping to pay for and the numbers match what a shopper sees. The
// whole report is cached for ten minutes.

import PriceHistory from "../models/priceHistory.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { CATALOG_CATEGORIES, getCatalogGroups } from "./catalogFeed.service.js";
import { readEvaluation } from "./evaluationReport.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const EXAMPLES = 3;
const PTA_CATEGORIES = new Set(["smartphone", "tablet"]);

/**
 * Counts what the checks found across grouped, checked offers. Pure, so it is tested without a database.
 * @param {object[]} groups  grouped offers as the catalog serves them
 * @param {object} [options]
 * @param {number} [options.now]  epoch ms
 */
export function summarizeGroups(groups, { now = Date.now() } = {}) {
  const platforms = new Set();
  const out = {
    offers: 0, stores: 0, products: groups.length, productsCompared: 0,
    unusualPrices: { count: 0, examples: [] },
    discounts: { claims: 0, verdicts: { genuine: 0, likelyGenuine: 0, suspicious: 0, likelyFake: 0, unverified: 0 }, aboveMarket: 0 },
    pta: { offers: 0, approved: 0, nonPta: 0, notStated: 0, movedOut: 0, readFromProductPage: 0, productsKeptApart: 0 },
    freshness: { within24h: 0, within72h: 0, newestAt: null },
  };

  let newest = 0;
  const exampleStores = new Set();

  for (const group of groups) {
    const stores = new Set(group.offers.map((offer) => String(offer.platform).toLowerCase()));
    if (stores.size >= 2) out.productsCompared += 1;
    if (group.ptaStatus === "non_pta" || group.ptaStatus === "likely_non_pta") out.pta.productsKeptApart += 1;

    for (const offer of group.offers) {
      out.offers += 1;
      platforms.add(String(offer.platform).toLowerCase());

      if (offer.priceCheck?.status?.startsWith("suspect")) {
        out.unusualPrices.count += 1;
        const store = String(offer.platform).toLowerCase();
        if (out.unusualPrices.examples.length < EXAMPLES && offer.priceCheck.reason && !exampleStores.has(store)) {
          exampleStores.add(store);
          out.unusualPrices.examples.push({ title: offer.title, platform: offer.platform, price: offer.price, reason: offer.priceCheck.reason });
        }
      }

      if (offer.originalPrice > offer.price) {
        out.discounts.claims += 1;
        const verdict = offer.discountAnalysis?.classification;
        if (verdict === "genuine_discount") out.discounts.verdicts.genuine += 1;
        else if (verdict === "possibly_genuine") out.discounts.verdicts.likelyGenuine += 1;
        else if (verdict === "suspicious") out.discounts.verdicts.suspicious += 1;
        else if (verdict === "likely_fake") out.discounts.verdicts.likelyFake += 1;
        else out.discounts.verdicts.unverified += 1;
      }
      if (offer.discountAnomaly?.isAnomalous) out.discounts.aboveMarket += 1;

      if (PTA_CATEGORIES.has(offer.productCategory)) {
        out.pta.offers += 1;
        if (offer.ptaStatus === "pta_approved") out.pta.approved += 1;
        else if (offer.ptaStatus === "non_pta") out.pta.nonPta += 1;
        if (offer.ptaAssessment === "not_stated") out.pta.notStated += 1;
        if (offer.ptaAssessment === "likely_non_pta") out.pta.movedOut += 1;
        if (offer.ptaSource === "product_page" && offer.ptaStatus !== "unknown") out.pta.readFromProductPage += 1;
      }

      const scraped = new Date(offer.lastScrapedAt ?? 0).getTime();
      if (Number.isFinite(scraped) && scraped > 0) {
        if (now - scraped <= DAY_MS) out.freshness.within24h += 1;
        if (now - scraped <= 3 * DAY_MS) out.freshness.within72h += 1;
        if (scraped > newest) newest = scraped;
      }
    }
  }

  out.stores = platforms.size;
  out.freshness.newestAt = newest ? new Date(newest).toISOString() : null;
  return out;
}

/** How much price history has been recorded: price points, calendar days (Pakistan time) and the first day. */
async function historyDepth() {
  const [row] = await PriceHistory.aggregate([
    { $unwind: "$entries" },
    {
      $group: {
        _id: null,
        points: { $sum: 1 },
        since: { $min: "$entries.recordedAt" },
        days: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$entries.recordedAt", timezone: "Asia/Karachi" } } },
      },
    },
  ]);
  return row ? { points: row.points, days: row.days.length, since: row.since ? new Date(row.since).toISOString() : null } : { points: 0, days: 0, since: null };
}

let cache = null;
let inFlight = null;

export function clearIntegrityCache() {
  cache = null;
  inFlight = null;
}

async function compute(now) {
  const all = [];
  for (const category of CATALOG_CATEGORIES) all.push(...(await getCatalogGroups(category, now)).groups);

  const [live, history, listings] = await Promise.all([
    Promise.resolve(summarizeGroups(all, { now })),
    historyDepth(),
    Listing.countDocuments({ ...VISIBLE_PLATFORMS_FILTER, price: { $gt: 0 } }),
  ]);
  return { generatedAt: new Date(now).toISOString(), live: { ...live, listings, history }, evaluation: readEvaluation() };
}

/** The honesty report, cached for ten minutes; concurrent first requests share one computation. */
export async function getIntegrityReport({ now = Date.now() } = {}) {
  if (cache && cache.expires > now) return cache.report;
  if (inFlight) return inFlight;

  inFlight = compute(now)
    .then((report) => {
      cache = { expires: now + CACHE_TTL_MS, report };
      return report;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
