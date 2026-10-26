// scraper.service.js
// Bridges the scraper layer (Muzammil) with the backend API layer (Arsalan).
//
// When the search API is called, this service:
//   1. Checks if fresh data exists in MongoDB for this query
//   2. If data is missing, runs live scrapers and waits for them; if it is only stale, starts them in the
//      background and returns at once (the search answers from what is stored)
//   3. Saves results to MongoDB (listings + price history)
//   4. Returns so the controller can proceed with grouping/ranking
//
// This makes ShopSavvy a "live" system — searches always return
// up-to-date prices, not just whatever was last seeded manually.

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import PriceHistory from "../models/priceHistory.model.js";
import { normalizeTitle } from "./normalizeTitle.service.js";
import { scrapeAllPlatforms } from "../scrapers/index.js";
import { extractAttributes } from "./productAttributes.service.js";
import { extractExtras } from "./scrapedExtras.service.js";
import { retryOnDuplicateKey } from "./retryOnDuplicateKey.js";
import { sanitizePrices } from "./priceSanity.service.js";
import { quote } from "../config/logSafe.js";
// How old data can be before we re-scrape: 30 minutes (searchFreshness.js, shared with the search controller).
import { STALE_THRESHOLD_MINUTES } from "./searchFreshness.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Query parameters that identify a *search session*, not a product. Telemart
// (Shopify) appends _pos/_sid/_ss to every result link, and they change on
// every search -- because listings and price history are keyed on
// platform + sourceUrl, each search inserted the same product again. Found
// 2026-09-29: 182 of 248 Telemart listings were duplicates of 66 products,
// and none of them could accumulate price history. Only known tracking
// params are stripped; anything else (e.g. a Shopify ?variant=) can identify
// a genuinely different product and is kept.
const TRACKING_PARAMS = new Set(["_pos", "_sid", "_ss", "_fid", "fbclid", "gclid"]);

export function canonicalSourceUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

/** The stored listings a query's freshness is judged on: visible ones whose title contains the query. */
function storedFilter(query) {
  const trimmed = query.trim();
  const normalizedQuery = normalizeTitle(trimmed);

  // A query made only of words normalizeTitle strips (e.g. "apple" alone)
  // normalises to an empty string, and an empty regex matches every
  // document -- see listing.controller.js for the same guard on the actual
  // search filter. Skipping the clause here keeps a freshness check for
  // "apple" from being satisfied by literally any recently scraped listing.
  return {
    ...VISIBLE_PLATFORMS_FILTER,
    $or: [
      { title: { $regex: escapeRegex(trimmed), $options: "i" } },
      ...(normalizedQuery
        ? [{ normalizedTitle: { $regex: escapeRegex(normalizedQuery), $options: "i" } }]
        : []),
    ],
  };
}

const staleBefore = () => new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

/**
 * Checks if we have fresh listings in MongoDB for a given query.
 * "Fresh" means scraped within the last STALE_THRESHOLD_MINUTES.
 */
async function hasFreshData(query) {
  const count = await Listing.countDocuments({ ...storedFilter(query), lastScrapedAt: { $gte: staleBefore() } });
  return count > 0;
}

/**
 * What we hold for a query: "fresh" (some matching listing scraped within STALE_THRESHOLD_MINUTES), "stale" (matching
 * listings, all older) or "missing" (none at all).
 */
async function storedDataState(query) {
  if (await hasFreshData(query)) return "fresh";
  const any = await Listing.exists(storedFilter(query));
  return any ? "stale" : "missing";
}

/**
 * Converts a ScrapedListing to a Listing model document.
 */
function toListingDoc(scraped) {
  const doc = {
    platform:        scraped.platform,
    title:           scraped.title,
    normalizedTitle: normalizeTitle(scraped.title),
    price:           scraped.price,
    originalPrice:   scraped.originalPrice ?? null,
    currency:        "PKR",
    sourceUrl:       scraped.sourceUrl,
    productUrl:      scraped.sourceUrl,
    imageUrl:        scraped.imageUrl ?? "",
    brand:           scraped.brand ?? null,
    category:        "Electronics",
    inStock:         scraped.inStock !== false,
    isActive:        true,
    lastScrapedAt:   new Date(),
    scrapedAt:       scraped.scrapedAt ? new Date(scraped.scrapedAt) : new Date(),
    ...extractAttributes(scraped.title),
    ...extractExtras(scraped),
  };

  // A title that says nothing about PTA must not undo what the store's product page said on an earlier day
  // (pageEnrichment.service.js): only a status the title itself states is written. A new listing still starts at
  // "unknown" through the schema default.
  if (doc.ptaStatus === "unknown") delete doc.ptaStatus;
  else doc.ptaSource = "title";

  return doc;
}

/**
 * Runs scrapers for a query and saves results to MongoDB.
 * Called automatically when data is missing or stale.
 *
 * @param {string} query - search term e.g. "iphone 15"
 * @param {object} [opts]
 * @param {boolean} [opts.dynamic] - also use Google discovery layer
 * @returns {Promise<number>} - number of listings saved
 */
async function runScrapersAndSave(query, opts = {}) {
  const { dynamic = false } = opts;

  console.log("[scraperService] Running live scrapers for: %s", quote(query));

  let scraped;
  try {
    scraped = await scrapeAllPlatforms(query, { dynamic });
  } catch (err) {
    console.error("[scraperService] Scraping failed for %s: %s", quote(query), err.message);
    return 0;
  }

  if (!scraped || scraped.length === 0) {
    console.log("[scraperService] No results from scrapers for %s", quote(query));
    return 0;
  }

  let saved = 0;
  let skippedPrices = 0;

  for (const scrapedItem of scraped) {
    // A price that cannot be real is skipped, and a "was" price that is not above the
    // current price is dropped (it is not a discount). See priceSanity.service.js.
    const checked = sanitizePrices(scrapedItem);
    if (!checked.ok) {
      skippedPrices++;
      continue;
    }

    // Canonicalise before both writes below, which key on sourceUrl.
    const item = {
      ...scrapedItem,
      price: checked.price,
      originalPrice: checked.originalPrice,
      sourceUrl: canonicalSourceUrl(scrapedItem.sourceUrl),
    };

    try {
      // Upsert listing
      // Retried once on a duplicate-key error: two searches saving the same new
      // product at once can both try to insert it; the second attempt then finds
      // and updates the one that won.
      await retryOnDuplicateKey(() =>
        Listing.findOneAndUpdate(
          { platform: item.platform, sourceUrl: item.sourceUrl },
          { $set: toListingDoc(item) },
          { upsert: true, returnDocument: "after" }
        )
      );

      // Record price history
      await PriceHistory.recordPrice(item);

      saved++;
    } catch (err) {
      console.warn("[scraperService] Failed to save %s: %s", quote(item.title), err.message);
    }
  }

  console.log(
    `[scraperService] Saved ${saved}/${scraped.length} listings for "${query}"` +
    (skippedPrices ? ` (${skippedPrices} skipped for an implausible price)` : "")
  );
  return saved;
}

// Tracks scrapes currently in progress, keyed by a normalized query, so a
// second request for the same query while the first is still running joins
// it instead of starting its own redundant scrape. Confirmed live
// 2026-09-29: without this, a slow query (~20s now, was worse before
// today's Playwright page-count fix) that gets requested twice before the
// first finishes -- a double-click, an impatient reload, two of the
// homepage's background fetches racing -- looks "not fresh yet" to both
// requests and each kicks off its own full 8-platform scrape, multiplying
// the load on the shared Playwright queue instead of just waiting.
const inFlightScrapes = new Map();

/** The scrape for `query` already running, or a new one: a second request for the same query joins the first. */
function startOrJoinScrape(query, { dynamic }) {
  const dedupeKey = query.trim().toLowerCase();
  const inFlight = inFlightScrapes.get(dedupeKey);
  if (inFlight) return { promise: inFlight, joined: true };

  // Never rejects: a scrape that fails saves nothing, and a background one has nobody waiting to be told.
  const promise = runScrapersAndSave(query, { dynamic })
    .catch((err) => {
      console.error("[scraperService] Saving the scrape for %s failed: %s", quote(query), err.message);
      return 0;
    })
    .finally(() => inFlightScrapes.delete(dedupeKey));
  inFlightScrapes.set(dedupeKey, promise);
  return { promise, joined: false };
}

/**
 * Main entry point called by the search controller.
 * Checks freshness and runs scrapers if needed.
 *
 * With `background`, a query we hold listings for, only older than STALE_THRESHOLD_MINUTES, is not made to wait: the
 * scrape is started (or joined) and this returns at once with `refreshing: true`, so the shopper sees the stored prices
 * now (each with its own "updated" time) instead of waiting 10 to 20 s for every store. `done` is the scrape's promise
 * (resolving to the number saved), for a caller that finds nothing to show and must wait after all. A query we hold
 * nothing for, and a forced refresh, still wait: there is nothing honest to show yet.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {boolean} [opts.force] - force re-scrape even if data is fresh
 * @param {boolean} [opts.dynamic] - use Google discovery layer
 * @param {boolean} [opts.background] - refresh stale data without waiting
 * @param {"fresh"|"stale"|"missing"} [opts.state] - what the caller already knows it holds (resultsState); else storedDataState
 * @returns {Promise<{scraped: boolean, refreshing?: boolean, saved?: number, reason: string, done?: Promise<number>}>}
 */
async function fetchAndRefreshListings(query, opts = {}) {
  const { force = false, dynamic = false, background = false } = opts;

  const state = opts.state ?? (await storedDataState(query));

  if (state === "fresh" && !force) {
    console.log("[scraperService] Fresh data found for %s, skipping scrape", quote(query));
    return { scraped: false, reason: "fresh_data" };
  }

  const { promise, joined } = startOrJoinScrape(query, { dynamic });

  if (background && state === "stale" && !force) {
    console.log("[scraperService] Stored data for %s is stale: answering now, refreshing in the background", quote(query));
    return { scraped: false, refreshing: true, reason: joined ? "joined_in_flight_background" : "stale_refreshing", done: promise };
  }

  if (joined) console.log("[scraperService] Scrape already in flight for %s, joining it", quote(query));
  const saved = await promise;
  const reason = joined ? "joined_in_flight" : force && state === "fresh" ? "force_refresh" : "stale_or_missing";
  return { scraped: true, saved, reason };
}

export {
  fetchAndRefreshListings,
  runScrapersAndSave,
  hasFreshData,
  storedDataState,
  toListingDoc,
};