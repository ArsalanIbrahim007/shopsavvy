// product.controller.js — one product and the same product at the other stores: the product page (GET /api/listings/:id), the
// browser extension's lookup (/match) and the Compare page (/compare). All read stored data; none scrapes.

import mongoose from "mongoose";

import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { getMarketMovement } from "../services/marketMovement.service.js";
import { currentOffers } from "../services/offerFreshness.service.js";
import { outlookForOffers } from "../services/priceOutlook.service.js";
import { isSuspectPrice } from "../services/pricePlausibility.service.js";
import { compareProducts, parseCompareIds } from "../services/productCompare.service.js";
import { LIMITS as MATCH_LIMITS, matchPage } from "../services/productMatch.service.js";
import { dropChance } from "../services/dropChance.service.js";
import { buildProductView } from "../services/productView.service.js";
import { textParam } from "../services/queryParams.service.js";
import { priceStats } from "./priceStats.js";
import { resolveMatchStrategy } from "./matchStrategy.js";

// Answers to the extension are kept for a while: a shopper moves between the same few pages, and the stored prices only change when
// a scrape runs. Keyed by everything that can change the answer.
const MATCH_CACHE_MS = 10 * 60 * 1000;
const MATCH_CACHE_SIZE = 500;
const matchCache = new Map();

export function clearMatchCache() {
  matchCache.clear();
}

/** "PKR 1,23,456", "Rs. 123456" or "123456" as a number; undefined when absent. */
function pageprice(value) {
  const text = textParam(value);
  if (text === undefined) return undefined;
  return Number(text.replace(/^(rs\.?|pkr)\s*/i, "").replace(/[,\s]/g, ""));
}

/**
 * GET /api/listings/match?url=&title=&price= — the product a store page shows, and the same product at the other stores. For the
 * browser extension. Read-only: it never scrapes (see productMatch.service.js).
 */
export async function getProductMatch(req, res) {
  const url = textParam(req.query.url);
  const title = textParam(req.query.title)?.replace(/\s+/g, " ");
  const price = pageprice(req.query.price);

  const errors = [];
  if (!url) errors.push({ field: "url", message: "The page address is required." });
  else if (url.length > MATCH_LIMITS.url) errors.push({ field: "url", message: `The page address is longer than ${MATCH_LIMITS.url} characters.` });
  if (title && title.length > MATCH_LIMITS.title) errors.push({ field: "title", message: `The title is longer than ${MATCH_LIMITS.title} characters.` });
  if (price !== undefined && !(price >= MATCH_LIMITS.minPrice && price <= MATCH_LIMITS.maxPrice)) {
    errors.push({ field: "price", message: "The price must be a number of rupees." });
  }
  if (errors.length) throw AppError.validation(errors);

  const strategy = resolveMatchStrategy(req);
  const key = JSON.stringify([strategy, url, title ?? null, price ?? null]);
  const cached = matchCache.get(key);
  if (cached && Date.now() - cached.at < MATCH_CACHE_MS) {
    res.json({ success: true, ...cached.result });
    return;
  }

  const result = await matchPage({ url, title, price }, { strategy });
  matchCache.delete(key);
  matchCache.set(key, { at: Date.now(), result });
  if (matchCache.size > MATCH_CACHE_SIZE) matchCache.delete(matchCache.keys().next().value);
  res.json({ success: true, ...result });
}

/**
 * GET /api/listings/compare?ids=a,b[,c,d] — 2 to 4 products side by side, for the Compare page (see productCompare.service.js).
 */
export async function getProductComparison(req, res) {
  const parsed = parseCompareIds(textParam(req.query.ids));
  if (parsed.errors) throw AppError.validation(parsed.errors);

  const result = await compareProducts(parsed.ids, { strategy: resolveMatchStrategy(req) });
  if (result.missing) {
    throw new AppError(404, `No listing with id ${result.missing.join(", ")}`, { code: "NOT_FOUND", details: { missing: result.missing } });
  }
  res.json({ success: true, ...result });
}

// A product page's answer is kept a minute (2026-11-08): building it groups the product with every store's offers (about 0.35 s), and
// a page is often opened again within seconds (back from a store, a shared link, the colour picker). Prices change at most nightly,
// so a minute never shows a stale price for long. At most PRODUCT_CACHE_MAX answers; the oldest goes first.
export const PRODUCT_CACHE_MS = 60 * 1000;
const PRODUCT_CACHE_MAX = 500;
const productCache = new Map(); // `${id}:${strategy}` -> { at, body }

export function clearProductCache() {
  productCache.clear();
}

export async function getListingDetails(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw AppError.invalidId("Invalid listing ID");
  }

  const cacheKey = `${id}:${resolveMatchStrategy(req)}`;
  const kept = productCache.get(cacheKey);
  if (kept && Date.now() - kept.at < PRODUCT_CACHE_MS) {
    res.set("X-Cache", "hit");
    return res.json(kept.body);
  }

  const listing = await Listing.findOne({ _id: id, ...VISIBLE_PLATFORMS_FILTER });

  if (!listing) {
    throw AppError.notFound("Listing not found");
  }

  // This listing and the same product at other stores (shared with the extension's /match lookup).
  const { selectedListing, selectedGroup, offers } =
    await buildProductView(listing, { strategy: resolveMatchStrategy(req) });

  // An offer flagged as a probable listing error must not set the lowest price or
  // the "you can save" figure.
  const prices = currentOffers(offers.filter((offer) => !isSuspectPrice(offer)))
    .map((offer) => Number(offer.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price > 0
    );

  const { lowestPrice, highestPrice, averagePrice } = priceStats(prices);

  const platforms = [
    ...new Set(
      offers
        .map((offer) => offer.platform)
        .filter(Boolean)
    ),
  ];

  const bestDeal =
    selectedGroup?.bestDeal ||
    [...offers].sort(
      (firstOffer, secondOffer) =>
        Number(secondOffer.dealScore || 0) -
        Number(firstOffer.dealScore || 0)
    )[0] ||
    selectedListing;

  // "Wait or buy?": what this product's own price records say, and how prices move across the catalog. Context only: if it
  // cannot be worked out the page is still served.
  let outlook = null;
  try {
    outlook = { ...outlookForOffers(offers), market: await getMarketMovement() };
  } catch (error) {
    console.error("[outlook] could not be worked out:", error.message);
  }

  // The trained drop forecast, per store's price (dropChance.service.js): only the offers in its riskiest 10%, with what the strict
  // test showed for them. Context only, like the outlook.
  let dropChances = [];
  try {
    dropChances = offers
      .map((offer) => ({ id: String(offer._id), platform: offer.platform, price: offer.price, chance: dropChance(offer) }))
      .filter((entry) => entry.chance);
  } catch (error) {
    console.error("[dropChance] could not be worked out:", error.message);
  }

  const body = {
    success: true,
    listing: selectedListing,
    productGroup: selectedGroup,
    summary: {
      platforms: platforms.length,
      lowestPrice,
      highestPrice,
      averagePrice,
      bestDealPlatform:
        bestDeal?.platform ||
        selectedListing.platform,
      bestDealTitle:
        bestDeal?.title ||
        selectedListing.title,
      bestDealScore:
        bestDeal?.dealScore ?? null,
      bestDealRecommendation:
        bestDeal?.recommendation?.action ||
        null,
    },
    outlook,
    dropChances,
    offers,
  };
  productCache.delete(cacheKey);
  productCache.set(cacheKey, { at: Date.now(), body });
  if (productCache.size > PRODUCT_CACHE_MAX) productCache.delete(productCache.keys().next().value);
  res.json(body);
}
