// feeds.controller.js — the home and browse pages' feeds, from stored data only (never a scrape): headline counts, top deals,
// price drops and a category's catalogue.

import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { getCatalog, isCatalogCategory, CATALOG_CATEGORIES } from "../services/catalogFeed.service.js";
import { getTopDeals, isDealCategory, DEAL_CATEGORIES } from "../services/dealsFeed.service.js";
import { DEFAULT_MAX_AGE_HOURS } from "../services/dealsRanking.service.js";
import { DROPS, getPriceDrops } from "../services/priceDrops.service.js";
import { textParam, numberParam } from "../services/queryParams.service.js";

// How many visible listings each product category holds, biggest first. The home page draws its
// category tiles from this. Cached briefly: it changes only when a scrape finishes.
const CATEGORY_COUNTS_TTL_MS = 60 * 1000;
let categoryCountsCache = { expires: 0, value: [] };

async function getCategoryCounts() {
  const now = Date.now();
  if (categoryCountsCache.expires > now) return categoryCountsCache.value;

  const rows = await Listing.aggregate([
    { $match: VISIBLE_PLATFORMS_FILTER },
    { $group: { _id: { $ifNull: ["$productCategory", "other"] }, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  const value = rows.map((row) => ({ category: row._id, count: row.count }));
  categoryCountsCache = { expires: now + CATEGORY_COUNTS_TTL_MS, value };
  return value;
}

/** For tests: forget the cached counts. */
export function clearCategoryCountsCache() {
  categoryCountsCache = { expires: 0, value: [] };
}

/**
 * Headline numbers for the homepage. Counting on the server means the page
 * no longer downloads every listing just to show two figures.
 */
export async function getListingStats(req, res) {
  const [products, platforms, categories] = await Promise.all([
    Listing.countDocuments(VISIBLE_PLATFORMS_FILTER),
    Listing.distinct("platform", VISIBLE_PLATFORMS_FILTER),
    getCategoryCounts(),
  ]);

  res.json({ success: true, products, platforms: platforms.length, categories });
}

/**
 * Top deals from stored data: products where the cheapest store beats the typical
 * price by a real margin. No scraping; served from a cache refreshed every ten
 * minutes (see dealsFeed.service.js).
 */
export async function getDeals(req, res) {
  const category = textParam(req.query.category);
  if (category && !isDealCategory(category)) {
    throw AppError.badRequest(`category must be one of: ${DEAL_CATEGORIES.join(", ")}`);
  }

  const limit = Math.min(Math.floor(numberParam(req.query.limit) ?? 12), 50);
  const { deals, generatedAt } = await getTopDeals({ category, limit });

  res.set("Cache-Control", "public, max-age=60");
  res.json({ success: true, count: deals.length, generatedAt, maxAgeHours: DEFAULT_MAX_AGE_HOURS, data: deals });
}

/**
 * Price drops from the recorded history: offers whose newest price is at least 5% and PKR 500 below the price recorded on the
 * previous day it was checked (see priceDrops.service.js). Stored data only, cached for ten minutes.
 */
export async function getPriceDropsFeed(req, res) {
  const category = textParam(req.query.category);
  if (category && !isDealCategory(category)) {
    throw AppError.badRequest(`category must be one of: ${DEAL_CATEGORIES.join(", ")}`);
  }

  const limit = Math.min(Math.max(Math.floor(numberParam(req.query.limit) ?? 24), 1), 50);
  const { drops, generatedAt } = await getPriceDrops({ category, limit });

  res.set("Cache-Control", "public, max-age=60");
  res.json({ success: true, count: drops.length, generatedAt, rules: DROPS, data: drops });
}

/**
 * Browse one category without searching: its products, most compared first, in pages. Served from a
 * cache computed in the worker pool (see catalogFeed.service.js), so it never scrapes or blocks the API.
 */
export async function getCategoryCatalog(req, res) {
  const category = textParam(req.query.category);
  if (!category || !isCatalogCategory(category)) {
    throw AppError.badRequest(`category is required and must be one of: ${CATALOG_CATEGORIES.join(", ")}`);
  }

  const limit = Math.min(Math.max(Math.floor(numberParam(req.query.limit) ?? 24), 1), 50);
  const offset = Math.max(Math.floor(Number(textParam(req.query.offset)) || 0), 0);
  const { groups, total, generatedAt } = await getCatalog({ category, limit, offset });

  res.set("Cache-Control", "public, max-age=60");
  res.json({ success: true, category, count: groups.length, total, offset, limit, generatedAt, data: groups });
}
