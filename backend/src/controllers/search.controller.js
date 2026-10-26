// search.controller.js — GET /api/listings/search and /suggest: the search box.
//
// A search reads what is stored first and decides from its own results whether to ask the stores (searchFreshness.js), then
// groups the listings into products (in a worker for large sets, grouping.service.js) and ranks them.

import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { detectQueryCategory } from "../scrapers/productCategory.js";
import { hasAdminKey } from "../middleware/adminKey.middleware.js";
import { groupListings } from "../services/grouping.service.js";
import { attachPriceHistory } from "../services/historyEnrichment.service.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";
import { currentOffers } from "../services/offerFreshness.service.js";
import { lowestBadge } from "../services/priceOutlook.service.js";
import { textParam, numberParam } from "../services/queryParams.service.js";
import { attachRecommendation } from "../services/recommendation/recommendation.service.js";
import { fetchAndRefreshListings } from "../services/scraper.service.js";
import { resultsState } from "../services/searchFreshness.js";
import { escapeRegex, buildSpaceTolerantPattern, fuzzyMatchIds } from "../services/searchMatching.service.js";
import { getSuggestions } from "../services/suggestions.service.js";
import { priceStats } from "./priceStats.js";
import { resolveMatchStrategy } from "./matchStrategy.js";

// Longest search text accepted. Real product searches are a handful of words;
// anything longer is a paste or an attack, and it would only be fed to
// regex-building and scraping.
const MAX_QUERY_LENGTH = 100;

/**
 * Creates a flat listing array from the recommended grouped offers.
 * This keeps the existing "data" field available in the search response.
 */
function createRecommendedListingArray(listings = [], groups = []) {
  const recommendedOffersById = new Map();

  groups.forEach((group) => {
    (group.offers || []).forEach((offer) => {
      if (offer?._id) {
        recommendedOffersById.set(
          offer._id.toString(),
          offer
        );
      }
    });
  });

  return listings.map((listing) => {
    const listingId = listing?._id?.toString();

    return (
      recommendedOffersById.get(listingId) ||
      attachRecommendation(listing)
    );
  });
}

/** Search-box suggestions from the listings we hold. Under two characters answers an empty list. */
export async function suggestListings(req, res) {
  const q = textParam(req.query.q) ?? "";
  if (q.length > MAX_QUERY_LENGTH) {
    throw AppError.badRequest(`Search query is too long (maximum ${MAX_QUERY_LENGTH} characters).`);
  }

  const limit = Math.min(Math.floor(numberParam(req.query.limit) ?? 8), 15);
  const data = await getSuggestions(q, { limit });

  res.set("Cache-Control", "public, max-age=30");
  res.json({ success: true, count: data.length, data });
}

/** The stored listings for a search: the exact match, else looser ones (see below), cheapest first. */
async function findSearchListings(trimmedQuery, searchFilter) {
  let listings = await Listing.find(searchFilter).sort({
    price: 1,
    createdAt: -1,
  });

  /*
   * The exact match found nothing -- try progressively looser strategies
   * before giving up, rather than showing an empty result for something
   * a real shopper would consider a reasonable typo. Each only runs if
   * the one before it found nothing, and both still respect the category
   * and attribute filters above so a fuzzy match can't leak results from
   * an unrelated product category.
   */
  /*
   * A typo'd query usually can't be classified (detectQueryCategory has
   * nothing exact to match), so no category filter makes it into
   * searchFilter above -- intentionally, since the same "no filter"
   * behaviour is what lets a genuine multi-category brand search like
   * "apple" or "samsung" return everything that brand makes (see
   * MULTI_CATEGORY_BRANDS in productCategory.js). But once we're already
   * in a fallback -- the strict match found nothing, so we're guessing --
   * that permissiveness works against us: "accessory" and "other" junk
   * (cases, chargers, holders, and miscategorized odds and ends) share
   * enough incidental text with the real product to fuzzy-match it, and
   * outrank it since there's nothing to tell them apart otherwise. A
   * misspelled main-product search is far more likely to mean the
   * product than an accessory for it or something uncategorized.
   */
  const fallbackCategoryFloor = searchFilter.productCategory
    ? {}
    : { productCategory: { $nin: ["accessory", "other"] } };

  if (listings.length === 0) {
    const queryTokens = trimmedQuery.split(/[^a-zA-Z0-9]+/).filter((t) => t.length >= 2);

    if (queryTokens.length > 0) {
      const tokenFilter = {
        ...searchFilter,
        ...fallbackCategoryFloor,
        $and: queryTokens.map((token) => ({
          title: { $regex: escapeRegex(token), $options: "i" },
        })),
      };
      delete tokenFilter.$or;

      listings = await Listing.find(tokenFilter).sort({ price: 1, createdAt: -1 });
    }
  }

  if (listings.length === 0) {
    const { $or, ...attributeFilters } = searchFilter;
    Object.assign(attributeFilters, fallbackCategoryFloor);

    const candidates = await Listing.find(attributeFilters, { title: 1 }).lean();
    const fuzzyIds = fuzzyMatchIds(trimmedQuery, candidates);

    if (fuzzyIds.length > 0) {
      listings = await Listing.find({ _id: { $in: fuzzyIds } }).sort({ price: 1, createdAt: -1 });
    }
  }

  return listings;
}

export async function searchListings(req, res) {
  const q = textParam(req.query.q);

  if (!q) {
    throw AppError.badRequest("Search query is required. Example: /api/listings/search?q=iphone");
  }

  if (q.length > MAX_QUERY_LENGTH) {
    throw AppError.badRequest(`Search query is too long (maximum ${MAX_QUERY_LENGTH} characters).`);
  }
  const trimmedQuery = q.trim();

  const normalizedQuery = normalizeTitle(trimmedQuery);

/*
   * The scrape-time category filter only governs what is written. Listings
   * collected before that filter existed are still stored, so the category
   * constraint is applied again here at query time. Without this, a search
   * for "laptop" returns bags and batteries saved by earlier runs.
   */
  /*
   * The category may be supplied explicitly by the caller, which the homepage
   * carousels use to request only phones or only laptops. When it is not
   * supplied it is inferred from the query text.
   */
  const requestedCategory = textParam(req.query.category);
  const queryCategory = requestedCategory || detectQueryCategory(trimmedQuery).category;

  /*
   * The raw query can contain regex metacharacters ("iPhone (17)", "9+"),
   * which would either throw or match something unintended if passed
   * straight into $regex, so it is escaped before use.
   * buildSpaceTolerantPattern also escapes, and additionally lets a
   * missing space at a letter/digit boundary match either way, so
   * "iphone17" still finds "iPhone 17" and vice versa.
   *
   * normalizeTitle strips whole words it considers noise (brand names such
   * as "apple", compliance/marketing terms). A query consisting only of
   * such words -- "apple" is itself one -- normalises to an empty string,
   * and an empty pattern matches every document. That clause is therefore
   * only added once there is still something left to match on.
   */
  const searchFilter = {
    ...VISIBLE_PLATFORMS_FILTER,
    $or: [
      { title: { $regex: buildSpaceTolerantPattern(trimmedQuery), $options: "i" } },
      ...(normalizedQuery
        ? [{ normalizedTitle: { $regex: buildSpaceTolerantPattern(normalizedQuery), $options: "i" } }]
        : []),
    ],
  };

  if (queryCategory !== "other" && queryCategory !== "accessory") {
    searchFilter.productCategory = queryCategory;
  }

  // Optional filters supplied by the user
  const storage = numberParam(req.query.storage);
  if (storage) searchFilter.storageGb = storage;
  const colour = textParam(req.query.colour);
  const condition = textParam(req.query.condition);
  const pta = textParam(req.query.pta);
  if (colour) searchFilter.colour = colour;
  if (condition) searchFilter.condition = condition;
  if (pta) searchFilter.ptaStatus = pta;

  let listings = await findSearchListings(trimmedQuery, searchFilter);

  // Whether to ask the stores is decided from what this search would show: fresh when one of its results was checked within the
  // freshness window, stale when it has results but all older (answered now, refreshed in the background), missing when it has
  // none (it waits for the stores). Judging by whether a stored title contained the phrase word for word, as before, called
  // "samsung tv" missing even right after 176 Samsung TVs were scraped: every such search waited ~17 s and asked all 23 stores
  // again (found by the load test, 2026-10-26).
  const { done: _refreshDone, ...refreshResult } = await fetchAndRefreshListings(trimmedQuery, {
    // Forcing a re-scrape bypasses the freshness window and costs a full round of
    // requests to every store, so it needs the admin key. Anyone else's
    // ?refresh=true is ignored: they simply get the normal cached behaviour.
    force: req.query.refresh === "true" && hasAdminKey(req),
    dynamic: false,
    background: true,
    state: resultsState(listings),
  });
  console.log("[search]", refreshResult);

  // The stores were asked and waited for (nothing was stored, or a forced refresh): read the results again.
  if (refreshResult.scraped) listings = await findSearchListings(trimmedQuery, searchFilter);

  /*
   * Correct processing order:
   *
   * Database listings
   * → attach price history
   * → group and rank products
   * → generate recommendations
   */
  const enrichedListings =
    await attachPriceHistory(listings);

  // Runs in a worker thread when the result set is large (see grouping.service.js).
  const groups =
    await groupListings(enrichedListings, { strategy: resolveMatchStrategy(req) });

  // "Lowest we have recorded" on a product's card: the same rule as its outlook (priceOutlook.service.js), from the history attached above.
  for (const group of groups) group.atLow = lowestBadge(group.offers);

  const recommendedListings =
    createRecommendedListingArray(
      enrichedListings,
      groups
    );

  // a price not checked for two weeks is not "the lowest price" (offerFreshness.service.js)
  const prices = currentOffers(recommendedListings)
    .map((listing) => Number(listing.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price > 0
    );

  const { lowestPrice, highestPrice, averagePrice } = priceStats(prices);

  const platforms = [
    ...new Set(
      recommendedListings
        .map((listing) => listing.platform)
        .filter(Boolean)
    ),
  ];

 /*
   * A "best deal" is only meaningful when the product was actually compared
   * across platforms. Groups holding a single offer are excluded unless no
   * multi-offer group exists, which stops an unrelated one-off listing from
   * outranking a genuinely compared product.
   */
  const comparableGroups = groups.filter(
    (group) => (group.offerCount || 0) >= 2
  );

  const candidateGroups =
    comparableGroups.length > 0 ? comparableGroups : groups;

  const bestDeal =
    candidateGroups
      .map((group) => group.bestDeal)
      .filter(Boolean)
      .sort(
        (firstOffer, secondOffer) =>
          Number(secondOffer.dealScore || 0) -
          Number(firstOffer.dealScore || 0)
      )[0] || null;

  res.json({
    success: true,
    refresh: refreshResult,
    query: q,
    count: recommendedListings.length,
    groupCount: groups.length,
    summary: {
      platforms: platforms.length,
      lowestPrice,
      highestPrice,
      averagePrice,
      bestDealPlatform:
        bestDeal?.platform || null,
      bestDealTitle: bestDeal?.title || null,
      bestDealScore:
        bestDeal?.dealScore ?? null,
      bestDealRecommendation:
        bestDeal?.recommendation?.action || null,
    },
    groups,
    data: recommendedListings,
  });
}
