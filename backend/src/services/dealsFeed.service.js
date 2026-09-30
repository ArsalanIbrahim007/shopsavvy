// dealsFeed.service.js — the homepage "top deals" feed.
//
// The homepage used to fill its carousels by running whole searches, each of which
// can trigger live scraping and counts against the search rate limit. This serves
// the same idea from data already stored: no scraping, no per-request grouping.
//
//   category deals = load fresh listings -> (worker thread) group + rank -> cache 10 min
//
// A request that finds a category cached answers instantly; the first one after a
// restart waits for the computation (seconds), and warmDealsCache() at start-up
// makes even that rare. Concurrent requests for the same category share one
// computation.

import { Worker } from "node:worker_threads";

import Listing from "../models/listing.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import { attachPriceHistory } from "./historyEnrichment.service.js";
import { DEFAULT_MAX_AGE_HOURS } from "./dealsRanking.service.js";

// Categories where "the same product at several stores" is the point of the site.
export const DEAL_CATEGORIES = ["smartphone", "laptop", "tv", "tablet", "smartwatch", "headphones"];
export const isDealCategory = (value) => DEAL_CATEGORIES.includes(value);

const CACHE_TTL_MS = 10 * 60 * 1000;
const WORKER_TIMEOUT_MS = 90 * 1000;

const cache = new Map(); // category -> { expires, generatedAt, deals }
const inFlight = new Map(); // category -> Promise

export function clearDealsCache() {
  cache.clear();
  inFlight.clear();
}

/**
 * Runs computeCategoryDeals in a worker thread. Listings are sent as plain data
 * (ids as strings): a Mongo ObjectId does not survive being copied to a worker.
 */
export function computeDealsInWorker(listings, options = {}, { timeoutMs = WORKER_TIMEOUT_MS } = {}) {
  const plain = listings.map((listing) => ({ ...listing, _id: String(listing._id) }));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/dealsWorker.js", import.meta.url), {
      workerData: { listings: plain, options },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Deals computation timed out"));
    }, timeoutMs);

    worker.once("message", (message) => {
      clearTimeout(timer);
      worker.terminate();
      message.ok ? resolve(message.deals) : reject(new Error(message.error));
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function computeCategory(category, now) {
  const cutoff = new Date(now - DEFAULT_MAX_AGE_HOURS * 3600 * 1000);
  const listings = await Listing.find({
    ...VISIBLE_PLATFORMS_FILTER,
    productCategory: category,
    price: { $gt: 0 },
    lastScrapedAt: { $gte: cutoff },
  }).lean();

  const enriched = await attachPriceHistory(listings);
  return computeDealsInWorker(enriched, { now });
}

/** Deals for one category, from cache when fresh. */
async function categoryDeals(category, now) {
  const hit = cache.get(category);
  if (hit && hit.expires > now) return hit;

  if (inFlight.has(category)) return inFlight.get(category);

  const computation = computeCategory(category, now)
    .then((deals) => {
      const entry = { expires: now + CACHE_TTL_MS, generatedAt: new Date(now).toISOString(), deals };
      cache.set(category, entry);
      return entry;
    })
    .finally(() => inFlight.delete(category));

  inFlight.set(category, computation);
  return computation;
}

/**
 * @param {object} [options]
 * @param {string} [options.category]  one of DEAL_CATEGORIES; omitted means all of them
 * @param {number} [options.limit]
 * @returns {Promise<{deals: object[], generatedAt: string}>}
 */
export async function getTopDeals({ category, limit = 12, now = Date.now() } = {}) {
  const categories = category ? [category] : DEAL_CATEGORIES;
  const entries = await Promise.all(categories.map((c) => categoryDeals(c, now)));

  const deals = entries
    .flatMap((entry) => entry.deals)
    .sort((a, b) => b.savingPercent - a.savingPercent || b.savingAmount - a.savingAmount)
    .slice(0, limit);

  const generatedAt = entries.map((e) => e.generatedAt).sort()[0]; // the oldest, so freshness is not overstated
  return { deals, generatedAt };
}

/** Fills the cache in the background at start-up. Never throws. */
export async function warmDealsCache() {
  for (const category of DEAL_CATEGORIES) {
    try {
      await categoryDeals(category, Date.now());
    } catch (error) {
      console.warn(`[deals] Could not warm ${category}: ${error.message}`);
    }
  }
  console.log("[deals] Cache warmed");
}
