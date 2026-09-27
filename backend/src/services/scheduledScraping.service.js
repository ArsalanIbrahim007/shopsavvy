// scheduledScraping.service.js — builds the query list a scheduled job
// should re-scrape, and runs it with pacing between requests.
//
// There's no "tracked products" concept in the schema yet, so this derives
// one representative search query per distinct PRODUCT (not per raw
// listing) by reusing the existing grouping logic -- re-scraping by raw
// listing would mean ~870 individual full 4-platform searches, the vast
// majority redundant with each other, and enough load to risk getting the
// scrapers rate-limited or blocked by the source sites.

import Listing from "../models/listing.model.js";
import { groupListingsByProduct } from "./productGrouping.service.js";
import { modelTokens } from "./normalizeTitle.service.js";
import { runScrapersAndSave } from "./scraper.service.js";

const MAX_QUERY_WORDS = 4;

// Demo queries carry hand-seeded originalPrice values (seed-fake-discount.js)
// so the fake-discount badges have something to show. A scheduled re-scrape
// upserts fresh price/originalPrice from the live site on every run, which
// would silently overwrite that seeding -- the demo routine already re-seeds
// right before presenting (see context.md's Demo Operations section), but
// that only helps if it's actually run that day; excluding these here means
// an unattended overnight job can't quietly break the demo in the meantime.
const DEMO_PROTECTED_QUERIES = new Set(["iphone 17 pro", "samsung galaxy a57"]);

// modelTokens() strips capacity tokens ("8gb", "256gb") but leaves a bare
// "ram" or "storage" behind when the title spells them out separately
// ("8GB RAM 256GB Storage"), producing a garbled query like "galaxy a17
// ram". These only matter for reading the numbers next to them, which
// modelTokens already removed, so they're dropped here too -- scoped to
// query derivation only, not touching normalizeTitle itself, since other
// callers (matching, grouping) don't have this problem.
const STRAY_WORDS = new Set(["ram", "storage"]);

/**
 * A search-friendly query from a product group's title: brand + model name,
 * capacity and marketing noise already stripped by modelTokens, capped to a
 * handful of words so it reads like something a real shopper would type
 * rather than a full product title.
 */
export function deriveQuery(title) {
  const words = modelTokens(title).split(" ").filter((w) => w && !STRAY_WORDS.has(w));
  return words.slice(0, MAX_QUERY_WORDS).join(" ");
}

/**
 * Loads every stored listing, groups it into distinct products per
 * category (same logic the search endpoint uses), and returns one
 * deduplicated query per group that is actually compared across platforms.
 *
 * Single-offer groups are skipped: with ~870 listings this produces over
 * 700 distinct queries, which at four platforms each is enough daily
 * request volume to risk getting the scrapers rate-limited or blocked.
 * Multi-offer groups are where price history actually matters most anyway
 * -- they're the ones a comparison and a "genuine discount" verdict can be
 * shown for; a single-offer listing has nothing to compare against
 * regardless of how much history it accumulates.
 *
 * @param {{minOffers?: number}} [opts]
 * @returns {Promise<string[]>}
 */
export async function buildScheduledQueryList({ minOffers = 2 } = {}) {
  const listings = await Listing.find().lean();

  const byCategory = new Map();
  for (const listing of listings) {
    const category = listing.productCategory || "other";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(listing);
  }

  const queries = new Set();
  for (const [, items] of byCategory) {
    const groups = groupListingsByProduct(items);
    groups
      .filter((group) => (group.offerCount || 0) >= minOffers)
      .forEach((group) => {
        const query = deriveQuery(group.rawGroupKey || group.productName || "");
        if (query && !DEMO_PROTECTED_QUERIES.has(query)) queries.add(query);
      });
  }

  return [...queries];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-scrapes every derived query in sequence (never in parallel -- this is
 * a background job with no user waiting on it, and hammering four sites
 * concurrently is exactly the kind of load that gets a scraper blocked). A
 * delay between requests keeps it polite to the source sites.
 *
 * @param {{queries?: string[], delayMs?: number, onProgress?: (info) => void}} [opts]
 */
export async function runScheduledScrape(opts = {}) {
  const { delayMs = 3000, onProgress } = opts;
  const queries = opts.queries || (await buildScheduledQueryList());

  const summary = { totalQueries: queries.length, totalSaved: 0, failures: [] };
  const startedAt = Date.now();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const saved = await runScrapersAndSave(query);
      summary.totalSaved += saved;
      onProgress?.({ index: i + 1, total: queries.length, query, saved });
    } catch (err) {
      summary.failures.push({ query, error: err.message });
      onProgress?.({ index: i + 1, total: queries.length, query, error: err.message });
    }

    if (i < queries.length - 1) await sleep(delayMs);
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}
