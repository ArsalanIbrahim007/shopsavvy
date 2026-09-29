// scraper.service.js
// Bridges the scraper layer (Muzammil) with the backend API layer (Arsalan).
//
// When the search API is called, this service:
//   1. Checks if fresh data exists in MongoDB for this query
//   2. If data is stale or missing, runs live scrapers
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
// How old data can be before we re-scrape (in minutes)
// Set to 30 minutes so rapid repeated searches don't hammer sites
const STALE_THRESHOLD_MINUTES = 30;

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

/**
 * Checks if we have fresh listings in MongoDB for a given query.
 * "Fresh" means scraped within the last STALE_THRESHOLD_MINUTES.
 */
async function hasFreshData(query) {
  const trimmed = query.trim();
  const normalizedQuery = normalizeTitle(trimmed);
  const threshold = new Date(
    Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000
  );

  // A query made only of words normalizeTitle strips (e.g. "apple" alone)
  // normalises to an empty string, and an empty regex matches every
  // document -- see listing.controller.js for the same guard on the actual
  // search filter. Skipping the clause here keeps a freshness check for
  // "apple" from being satisfied by literally any recently scraped listing.
  const count = await Listing.countDocuments({
    ...VISIBLE_PLATFORMS_FILTER,
    $or: [
      { title: { $regex: escapeRegex(trimmed), $options: "i" } },
      ...(normalizedQuery
        ? [{ normalizedTitle: { $regex: escapeRegex(normalizedQuery), $options: "i" } }]
        : []),
    ],
    lastScrapedAt: { $gte: threshold },
  });

  return count > 0;
}

/**
 * Converts a ScrapedListing to a Listing model document.
 */
function toListingDoc(scraped) {
  return {
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
  };
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

  console.log(`[scraperService] Running live scrapers for: "${query}"`);

  let scraped;
  try {
    scraped = await scrapeAllPlatforms(query, { dynamic });
  } catch (err) {
    console.error(`[scraperService] Scraping failed for "${query}":`, err.message);
    return 0;
  }

  if (!scraped || scraped.length === 0) {
    console.log(`[scraperService] No results from scrapers for "${query}"`);
    return 0;
  }

  let saved = 0;

  for (const scrapedItem of scraped) {
    if (!scrapedItem.price) continue;

    // Canonicalise before both writes below, which key on sourceUrl.
    const item = { ...scrapedItem, sourceUrl: canonicalSourceUrl(scrapedItem.sourceUrl) };

    try {
      // Upsert listing
      await Listing.findOneAndUpdate(
        { platform: item.platform, sourceUrl: item.sourceUrl },
        { $set: toListingDoc(item) },
        { upsert: true, returnDocument: "after" }
      );

      // Record price history
      await PriceHistory.recordPrice(item);

      saved++;
    } catch (err) {
      console.warn(`[scraperService] Failed to save "${item.title}":`, err.message);
    }
  }

  console.log(`[scraperService] Saved ${saved}/${scraped.length} listings for "${query}"`);
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

/**
 * Main entry point called by the search controller.
 * Checks freshness and runs scrapers if needed before returning.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {boolean} [opts.force] - force re-scrape even if data is fresh
 * @param {boolean} [opts.dynamic] - use Google discovery layer
 */
async function fetchAndRefreshListings(query, opts = {}) {
  const { force = false, dynamic = false } = opts;

  const fresh = await hasFreshData(query);

  if (fresh && !force) {
    console.log(`[scraperService] Fresh data found for "${query}", skipping scrape`);
    return { scraped: false, reason: "fresh_data" };
  }

  const dedupeKey = query.trim().toLowerCase();
  const inFlight = inFlightScrapes.get(dedupeKey);

  if (inFlight) {
    console.log(`[scraperService] Scrape already in flight for "${query}", joining it`);
    const saved = await inFlight;
    return { scraped: true, saved, reason: "joined_in_flight" };
  }

  const scrapePromise = runScrapersAndSave(query, { dynamic }).finally(() => {
    inFlightScrapes.delete(dedupeKey);
  });
  inFlightScrapes.set(dedupeKey, scrapePromise);

  const saved = await scrapePromise;
  return { scraped: true, saved, reason: fresh ? "force_refresh" : "stale_or_missing" };
}

export {
  fetchAndRefreshListings,
  runScrapersAndSave,
  hasFreshData,
};