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
import { extractBrand } from "./productAttributes.service.js";

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

const brandCache = new Map(); // "category:brand" -> Promise<{ expires, generatedAt, groups }>

export function clearCatalogCache() {
  cache.clear();
  brandCache.clear();
  inFlight.clear();
  fromDisk.clear();
}

function diskCatalog(category) {
  if (!fromDisk.has(category)) fromDisk.set(category, readSnapshot(`catalog-${category}`));
  return fromDisk.get(category);
}

/** Most offers first (the products people compare most), then the cheaper one. */
// Compared means across stores: by how many stores sell it, then how many distinct offers (a store's same title at the same price
// once), then the cheaper. By raw offer count, one AlfaMall seller's laptop listed many times led "Most compared laptops" as "1 offer
// from 1 store" (Fable's final check, 2026-11-12).
const storeCount = (group) => new Set((group.offers ?? []).map((offer) => offer.platform)).size;
const distinctOffers = (group) => new Set((group.offers ?? []).map((offer) => `${offer.platform}|${offer.title}|${offer.price}`)).size;
const mostCompared = (a, b) =>
  storeCount(b) - storeCount(a) || distinctOffers(b) - distinctOffers(a) || a.lowestPrice - b.lowestPrice;

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
      entry.brands = brandCounts(groups);
      // The brand counts too: after a restart, a brand's page answers before the whole category is grouped again (brandCatalog below),
      // and its brand filter still lists every brand.
      writeSnapshot(`catalog-${category}`, { generatedAt: entry.generatedAt, total: groups.length, brands: entry.brands, groups: groups.slice(0, SNAPSHOT_GROUPS) });
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

// listing id -> its group, per computed catalog (built on first use)
const groupByListing = new WeakMap();

/**
 * The product a listing belongs to in the category's catalog as last computed, or null when the catalog has not been computed or
 * does not hold it. Never starts a computation. For the product page, Compare and the extension, so that what opens from a card is
 * the product the card showed: they regrouped up to 300 nearby listings around the opened one, and "26 offers from 9 stores" on the
 * card became "4 offers from 1 store" on its page (Fable's review, 2026-11-12: 21 of the top 24 phone cards).
 */
export function peekCatalogGroupOf(category, listingId) {
  const entry = cache.get(category);
  if (!entry || listingId == null) return null;
  let index = groupByListing.get(entry);
  if (!index) {
    index = new Map();
    for (const group of entry.groups) for (const offer of group.offers ?? []) index.set(String(offer._id), group);
    groupByListing.set(entry, index);
  }
  return index.get(String(listingId)) ?? null;
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
/**
 * A product's brand: the one most of its offers state, in lower case, so "SAMSUNG" and "Samsung" are one brand (stores write it
 * either way: the phones' brand list showed both, 2026-11-10). Null when no offer states one.
 */
export function brandOfGroup(group) {
  const counts = new Map();
  for (const offer of group.offers ?? []) {
    const brand = extractBrand(offer.title, offer.brand); // read from the title too: most stores state no brand
    if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  let best = null;
  for (const [brand, n] of counts) if (!best || n > best.n) best = { brand, n };
  return best?.brand ?? null;
}

/** How many products of the category each brand has, most first: for the brand filter, which otherwise counted the page shown. */
function brandCounts(groups) {
  const counts = new Map();
  for (const group of groups) {
    const brand = brandOfGroup(group);
    if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return [...counts].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

/**
 * One brand's products, grouped from that brand's listings alone, for a brand's page before the whole category is grouped.
 * 2026-11-10: /results?category=smartphone&brand=apple never loaded after a restart: it waited for all 6,300 phone listings to be
 * grouped (over two minutes while the nightly scrape used the database), and the page gives up after 100 s. Apple's 668 listings are
 * grouped in seconds. A product's brand is the one most of its offers state (brandOfGroup), so a group is kept only if that is it.
 */
function brandCatalog(category, brand, now) {
  const key = `${category}:${brand}`;
  const hit = brandCache.get(key);
  if (hit && hit.expires > now) return hit.promise;
  const promise = (async () => {
    const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, productCategory: category, brand, price: { $gt: 0 } }).lean();
    const enriched = await attachPriceHistory(listings);
    const groups = await groupListings(enriched, { strategy: "ml", recommend: true, threshold: 0, timeoutMs: CATALOG_JOB_TIMEOUT_MS });
    return { generatedAt: new Date(now).toISOString(), groups: groups.filter((g) => brandOfGroup(g) === brand).sort(mostCompared).map(withoutHistory) };
  })();
  brandCache.set(key, { expires: now + CACHE_TTL_MS, promise });
  promise.catch(() => brandCache.delete(key));
  return promise;
}

/**
 * @param {object} options
 * @param {string} options.category  one of CATALOG_CATEGORIES
 * @param {number} [options.limit]   page size
 * @param {number} [options.offset]  how many products to skip
 * @param {string} [options.brand]   only this brand's products (any case)
 * @returns {Promise<{groups: object[], total: number, generatedAt: string, brands: Array<{brand: string, count: number}>|null}>}
 */
export async function getCatalog({ category, limit = 24, offset = 0, brand = null, now = Date.now() }) {
  // Nothing computed since start-up: the saved first page answers if it covers the page asked for, and the category is grouped meanwhile.
  // Not for one brand: the saved page holds only the most compared products of every brand.
  if (!cache.has(category) && !brand) {
    const saved = await diskCatalog(category);
    if (saved && offset + limit <= saved.groups.length) {
      refresh(category, now).catch((error) => console.warn(`[catalog] Could not refresh ${category}: ${error.message}`));
      return { groups: saved.groups.slice(offset, offset + limit), total: saved.total, generatedAt: saved.generatedAt, brands: null };
    }
  }
  const wanted = brand ? String(brand).trim().toLowerCase() : null;
  // One brand, and the category not grouped yet: that brand's listings alone, while the whole category is grouped in the background.
  if (wanted && !cache.has(category)) {
    refresh(category, now).catch((error) => console.warn(`[catalog] Could not refresh ${category}: ${error.message}`));
    const [own, saved] = await Promise.all([brandCatalog(category, wanted, now), diskCatalog(category)]);
    return { groups: own.groups.slice(offset, offset + limit), total: own.groups.length, generatedAt: own.generatedAt, brands: saved?.brands ?? null };
  }
  const entry = await categoryCatalog(category, now);
  const groups = wanted ? entry.groups.filter((group) => brandOfGroup(group) === wanted) : entry.groups;
  entry.brands ??= brandCounts(entry.groups); // once per computed catalog
  return { groups: groups.slice(offset, offset + limit), total: groups.length, generatedAt: entry.generatedAt, brands: entry.brands };
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
