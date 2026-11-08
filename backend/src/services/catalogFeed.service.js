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
import { readSnapshot, writeSnapshot } from "./snapshot.service.js";

// The categories the site is about (the same list the deals feed uses).
export const CATALOG_CATEGORIES = DEAL_CATEGORIES;
export const isCatalogCategory = (value) => CATALOG_CATEGORIES.includes(value);

const CACHE_TTL_MS = 10 * 60 * 1000;
// A whole category is grouped in the background, and the largest has outgrown the pool's 90 s for one job: air conditioners (7,546
// listings) timed out on 2026-11-08, so their catalog, their category page and the honest-prices counts failed. Nobody waits on this
// job (an old catalog is served meanwhile), so it gets five minutes.
export const CATALOG_JOB_TIMEOUT_MS = 5 * 60 * 1000;

const cache = new Map(); // category -> { expires, generatedAt, groups }
const inFlight = new Map(); // category -> Promise
// The first SNAPSHOT_GROUPS products of each category are saved to disk (snapshot.service.js): after a restart they answer the home
// page's rows and a category's first page at once, while the whole category is grouped again (30 s to minutes).
export const SNAPSHOT_GROUPS = 60;
const fromDisk = new Map(); // category -> Promise<{ generatedAt, total, groups } | null>

export function clearCatalogCache() {
  cache.clear();
  inFlight.clear();
  fromDisk.clear();
}

function diskCatalog(category) {
  if (!fromDisk.has(category)) fromDisk.set(category, readSnapshot(`catalog-${category}`));
  return fromDisk.get(category);
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
  // Background: the catalog is cached and warmed at start-up, so it yields the last worker to interactive requests.
  const groups = await groupListings(enriched, { strategy: "ml", recommend: true, threshold: 0, priority: "background", timeoutMs: CATALOG_JOB_TIMEOUT_MS });
  return groups.sort(mostCompared).map(withoutHistory);
}

function refresh(category, now) {
  if (inFlight.has(category)) return inFlight.get(category);
  const computation = computeCategory(category)
    .then((groups) => {
      const entry = { expires: now + CACHE_TTL_MS, generatedAt: new Date(now).toISOString(), groups };
      cache.set(category, entry);
      writeSnapshot(`catalog-${category}`, { generatedAt: entry.generatedAt, total: groups.length, groups: groups.slice(0, SNAPSHOT_GROUPS) });
      return entry;
    })
    .finally(() => inFlight.delete(category));
  inFlight.set(category, computation);
  return computation;
}

// Past its ten minutes, a category's last catalog is still served at once while a fresh one is computed in the background.
// Recomputing a large category takes 30 to 90 s (smartphones, TVs: 31 s and 88 s on 2026-11-08), and every ten minutes the home
// page's "Most compared" rows waited that long on spinners. Only the very first computation, at start-up, is waited for.
async function categoryCatalog(category, now) {
  const hit = cache.get(category);
  if (hit && hit.expires > now) return hit;
  if (hit) {
    refresh(category, now).catch((error) => console.warn(`[catalog] Could not refresh ${category}: ${error.message}`));
    return hit;
  }
  return refresh(category, now);
}

/**
 * A category's grouped products as last computed (even if past their ten minutes), or null when none has been: never starts a
 * computation. For the sitemap, which must not make a crawler's request group a whole category (a minute or more of worker time
 * at start-up, when the warm-up is already doing it).
 */
export function peekCatalogGroups(category) {
  const entry = cache.get(category);
  return entry ? { groups: entry.groups, generatedAt: entry.generatedAt } : null;
}

/** Every grouped product of a category, from the cache (computed first if needed). For reports that count across all of them. */
export async function getCatalogGroups(category, now = Date.now()) {
  const entry = await categoryCatalog(category, now);
  return { groups: entry.groups, generatedAt: entry.generatedAt };
}

/**
 * @param {object} options
 * @param {string} options.category  one of CATALOG_CATEGORIES
 * @param {number} [options.limit]   page size
 * @param {number} [options.offset]  how many products to skip
 * @returns {Promise<{groups: object[], total: number, generatedAt: string}>}
 */
export async function getCatalog({ category, limit = 24, offset = 0, now = Date.now() }) {
  // Nothing computed since start-up: the saved first page answers if it covers the page asked for, and the category is grouped meanwhile.
  if (!cache.has(category)) {
    const saved = await diskCatalog(category);
    if (saved && offset + limit <= saved.groups.length) {
      refresh(category, now).catch((error) => console.warn(`[catalog] Could not refresh ${category}: ${error.message}`));
      return { groups: saved.groups.slice(offset, offset + limit), total: saved.total, generatedAt: saved.generatedAt };
    }
  }
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
