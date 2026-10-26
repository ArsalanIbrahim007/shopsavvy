// productCompare.service.js — 2 to 4 products side by side, for the Compare page (GET /api/listings/compare, Muzammil's task S3/4).
//
// Each product is the group its listing belongs to, built the same way as the product page (productView.service.js): its best
// offer, lowest current price, PTA status, the specifications its stores' pages gave (merged, specsEngine.service.js), the Specs
// Score with the parts that make it, and where that score ranks among products priced like it. Score and rank come from
// Muzammil's Specs engine and are null until it is merged (`specsEngine` in the answer says which). Nothing here scrapes.

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { getCatalogGroups, isCatalogCategory } from "./catalogFeed.service.js";
import { currentOffers, isOutOfDate } from "./offerFreshness.service.js";
import { isSuspectPrice } from "./pricePlausibility.service.js";
import { extractPtaStatus } from "./productAttributes.service.js";
import { siteUrl } from "./productMatch.service.js";
import { productPath } from "./productPath.js";
import { buildProductView } from "./productView.service.js";
import { loadSpecsEngine, mergeSpecSheets, rankSpecScore, scoreSpecSheet } from "./specsEngine.service.js";

export const COMPARE_LIMITS = Object.freeze({ min: 2, max: 4 });

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const idOf = (offer) => offer?._id?.toString();
const ptaOf = (offer) => {
  const stated = extractPtaStatus(offer.title || "");
  return stated !== "unknown" ? stated : offer.ptaStatus ?? "unknown";
};

/** "a,b,c" -> { ids } or { errors }: 2 to 4 distinct listing ids. */
export function parseCompareIds(value) {
  const ids = typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const errors = [];
  if (ids.length < COMPARE_LIMITS.min || ids.length > COMPARE_LIMITS.max) {
    errors.push({ field: "ids", message: `Give ${COMPARE_LIMITS.min} to ${COMPARE_LIMITS.max} listing ids, separated by commas.` });
  } else if (ids.some((id) => !OBJECT_ID.test(id))) {
    errors.push({ field: "ids", message: "Each id must be a listing id (24 hexadecimal characters)." });
  } else if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    errors.push({ field: "ids", message: "Each product may be given once." });
  }
  return errors.length ? { errors } : { ids };
}

const offerSummary = (offer, now) => offer && {
  id: idOf(offer),
  platform: offer.platform,
  title: offer.title,
  price: offer.price,
  url: offer.productUrl || offer.sourceUrl || null,
  inStock: offer.inStock !== false,
  lastScrapedAt: offer.lastScrapedAt ?? null,
  outOfDate: isOutOfDate(offer, now),
};

/** The lowest price a shopper can rely on: current offers, implausible prices left out (as the product page's summary). */
const lowestCurrentPrice = (offers, now) => {
  const prices = currentOffers(offers.filter((o) => !isSuspectPrice(o)), now).map((o) => Number(o.price)).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
};

// The scored products of a category, worked out once per catalog build (the catalog is cached ten minutes).
const bandCache = new Map(); // category -> { generatedAt, entries: [{ id, ids: Set, score, price }] }

export function clearCompareCache() {
  bandCache.clear();
}

async function scoredCategory(category, catalog) {
  const { groups, generatedAt } = await catalog(category);
  const hit = bandCache.get(category);
  if (hit && hit.generatedAt === generatedAt) return hit.entries;
  const entries = [];
  for (const group of groups) {
    const { specs } = mergeSpecSheets(group.offers || []);
    const scored = await scoreSpecSheet(specs, category);
    if (!scored) continue;
    entries.push({
      id: idOf(group.bestDeal) ?? idOf(group.offers[0]),
      ids: new Set((group.offers || []).map(idOf)),
      score: scored.score,
      price: group.lowestPrice,
    });
  }
  bandCache.set(category, { generatedAt, entries });
  return entries;
}

/** Where `product` ({ id, score, price }) ranks among the other scored products of its category, or null. */
async function rankInCategory(category, product, { catalog, memberIds }) {
  if (!isCatalogCategory(category) || product.score == null || !(product.price > 0)) return null;
  const others = (await scoredCategory(category, catalog))
    .filter((entry) => ![...memberIds].some((id) => entry.ids.has(id))) // its own group, as built for the catalog
    .map(({ id, score, price }) => ({ id, score, price }));
  return rankSpecScore(product, others);
}

/** One column of the comparison. */
export async function describeProduct(listing, { strategy = "ml", now = Date.now(), site, catalog = getCatalogGroups } = {}) {
  const id = idOf(listing);
  const { selectedListing, selectedGroup, offers } = await buildProductView(listing, { strategy });
  const category = listing.productCategory || "other";
  const best = selectedGroup?.bestDeal ?? selectedListing;
  const lowestPrice = lowestCurrentPrice(offers, now);
  const { specs, from } = mergeSpecSheets(offers, { preferId: id });
  const specScore = await scoreSpecSheet(specs, category);
  const rank = specScore
    ? await rankInCategory(category, { id, category, score: specScore.score, price: lowestPrice ?? best.price }, { catalog, memberIds: new Set(offers.map(idOf)) })
    : null;

  return {
    id,
    name: selectedGroup?.productName ?? listing.title,
    category,
    image: listing.imageUrl || offers.find((o) => o.imageUrl)?.imageUrl || null,
    bestOffer: offerSummary(best, now),
    lowestPrice,
    offerCount: offers.length,
    stores: [...new Set(offers.map((o) => o.platform))].length,
    ptaStatus: selectedGroup?.ptaStatus ?? ptaOf(listing),
    specs,
    specsFrom: from,
    specScore,
    rank,
    productUrl: `${site}${productPath(id, listing.title)}`,
  };
}

/**
 * @param {string[]} ids  2 to 4 listing ids (parseCompareIds)
 * @returns {Promise<{missing: string[]} | {products: object[], specsEngine: "ready"|"missing"}>}
 */
export async function compareProducts(ids, { strategy = "ml", env = process.env, now = Date.now(), catalog = getCatalogGroups } = {}) {
  const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, _id: { $in: ids } }).lean();
  const byId = new Map(listings.map((l) => [idOf(l), l]));
  const missing = ids.filter((id) => !byId.has(id.toLowerCase()) && !byId.has(id));
  if (missing.length) return { missing };

  const site = siteUrl(env);
  const products = await Promise.all(ids.map((id) => describeProduct(byId.get(id) ?? byId.get(id.toLowerCase()), { strategy, now, site, catalog })));
  return { products, specsEngine: (await loadSpecsEngine()) ? "ready" : "missing" };
}
