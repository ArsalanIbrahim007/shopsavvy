// catalogFeed.service.js — browse a category without searching: the products of one category,
// most-compared first.
//
// The search endpoint needs text to match titles, and titles rarely contain the category word
// ("Samsung Galaxy A17" never says "phone"), so a shopper could not simply open "Smartphones".
// Grouping a whole category is the expensive part (a thousand listings take seconds of CPU),
// so it is done once in the grouping worker pool and cached, exactly like the deals feed:
//
//   category catalog = load listings -> (worker pool) group + recommend -> cache 10 min
//
// Requests read from the cache and page through it; concurrent first requests share one
// computation, and warmCatalogCache() at start-up makes even the first one rare.

import Listing from "../models/listing.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import { attachPriceHistory } from "./historyEnrichment.service.js";
import { groupListings } from "./grouping.service.js";
import { DEAL_CATEGORIES } from "./dealsFeed.service.js";

// The categories the site is about (the same list the deals feed uses).
export const CATALOG_CATEGORIES = DEAL_CATEGORIES;
export const isCatalogCategory = (value) => CATALOG_CATEGORIES.includes(value);

const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map(); // category -> { expires, generatedAt, groups }
const inFlight = new Map(); // category -> Promise

export function clearCatalogCache() {
  cache.clear();
  inFlight.clear();
}

/** Most offers first (the products people compare most), then the cheaper one. */
const mostCompared = (a, b) => b.offerCount - a.offerCount || a.lowestPrice - b.lowestPrice;

// The cards do not need each offer's price history (the product page loads it), and leaving it
// out keeps the response small.
function withoutHistory(group) {
  return { ...group, offers: group.offers.map(({ priceHistory: _priceHistory, ...offer }) => offer) };
}

async function computeCategory(category) {
  const listings = await Listing.find({
    ...VISIBLE_PLATFORMS_FILTER,
    productCategory: category,
    price: { $gt: 0 },
  }).lean();

  const enriched = await attachPriceHistory(listings);
  // threshold 0: always in the worker pool, however few listings there are, so this never blocks the API.
  const groups = await groupListings(enriched, { strategy: "ml", recommend: true, threshold: 0 });
  return groups.sort(mostCompared).map(withoutHistory);
}

async function categoryCatalog(category, now) {
  const hit = cache.get(category);
  if (hit && hit.expires > now) return hit;

  if (inFlight.has(category)) return inFlight.get(category);

  const computation = computeCategory(category)
    .then((groups) => {
      const entry = { expires: now + CACHE_TTL_MS, generatedAt: new Date(now).toISOString(), groups };
      cache.set(category, entry);
      return entry;
    })
    .finally(() => inFlight.delete(category));

  inFlight.set(category, computation);
  return computation;
}

/**
 * @param {object} options
 * @param {string} options.category  one of CATALOG_CATEGORIES
 * @param {number} [options.limit]   page size
 * @param {number} [options.offset]  how many products to skip
 * @returns {Promise<{groups: object[], total: number, generatedAt: string}>}
 */
export async function getCatalog({ category, limit = 24, offset = 0, now = Date.now() }) {
  const entry = await categoryCatalog(category, now);
  return { groups: entry.groups.slice(offset, offset + limit), total: entry.groups.length, generatedAt: entry.generatedAt };
}

/** Fills the cache in the background at start-up, one category at a time. Never throws. */
export async function warmCatalogCache() {
  for (const category of CATALOG_CATEGORIES) {
    try {
      await categoryCatalog(category, Date.now());
    } catch (error) {
      console.warn(`[catalog] Could not warm ${category}: ${error.message}`);
    }
  }
  console.log("[catalog] Cache warmed");
}
