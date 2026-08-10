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

import Listing from "../models/listing.model.js";
import PriceHistory from "../models/priceHistory.model.js";
import { normalizeTitle } from "./normalizeTitle.service.js";
import { scrapeAllPlatforms } from "../scrapers/index.js";

// How old data can be before we re-scrape (in minutes)
// Set to 30 minutes so rapid repeated searches don't hammer sites
const STALE_THRESHOLD_MINUTES = 30;

/**
 * Checks if we have fresh listings in MongoDB for a given query.
 * "Fresh" means scraped within the last STALE_THRESHOLD_MINUTES.
 */
async function hasFreshData(query) {
  const threshold = new Date(
    Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000
  );

  const count = await Listing.countDocuments({
    $or: [
      { title: { $regex: query, $options: "i" } },
      { normalizedTitle: { $regex: normalizeTitle(query), $options: "i" } },
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
    category:        scraped.category ?? "other",
    availability: scraped.inStock ? "in_stock" : "out_of_stock",    
    isActive:        true,
    lastScrapedAt:   new Date(),
    scrapedAt:       scraped.scrapedAt ? new Date(scraped.scrapedAt) : new Date(),
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

  for (const item of scraped) {
    if (!item.price) continue;

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

  const saved = await runScrapersAndSave(query, { dynamic });
  return { scraped: true, saved, reason: fresh ? "force_refresh" : "stale_or_missing" };
}

export {
  fetchAndRefreshListings,
  runScrapersAndSave,
  hasFreshData,
};