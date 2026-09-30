import mongoose from "mongoose";
import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { detectCategory, detectQueryCategory } from "../scrapers/productCategory.js";
import { attachPriceHistory } from "../services/historyEnrichment.service.js";
import { selectCandidates } from "../services/candidateSelection.service.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";
import { parsePagination } from "../services/pagination.service.js";
import { textParam, numberParam } from "../services/queryParams.service.js";
import { hasAdminKey } from "../middleware/adminKey.middleware.js";
import { isSuspectPrice } from "../services/pricePlausibility.service.js";

// Longest search text accepted. Real product searches are a handful of words;
// anything longer is a paste or an attack, and it would only be fed to
// regex-building and scraping.
const MAX_QUERY_LENGTH = 100;
import { groupListingsByProduct } from "../services/productGrouping.service.js";
import {
  getListingPriceHistory,
  recordPriceSnapshot,
} from "../services/priceHistory.service.js";
import {
  attachRecommendation,
  attachRecommendations,
} from "../services/recommendation/recommendation.service.js";
import {
  fetchAndRefreshListings,
} from "../services/scraper.service.js";
import {
  escapeRegex,
  buildSpaceTolerantPattern,
  fuzzyMatchIds,
} from "../services/searchMatching.service.js";
import { mlMatchStrategy } from "../services/similarityModel.service.js";

/**
 * The trained classifier is the default matching strategy as of 2026-09-28
 * (see backend/src/ml/EVALUATION_REPORT.md: F1 0.923 vs the old fixed-
 * threshold rule's 0.667 on held-out data). ?matching=rule falls back to
 * the original Jaccard-threshold behaviour -- kept reachable, not deleted,
 * as an escape hatch if the trained model ever needs to be compared
 * against or rolled back live without a code change.
 */
function resolveMatchStrategy(req) {
  return req.query.matching === "rule" ? undefined : mlMatchStrategy;
}
/**
 * Adds recommendations after product grouping and deal ranking.
 *
 * Recommendations must be generated after groupListingsByProduct()
 * because the grouping service adds deal scores and ranking details.
 */
function attachRecommendationsToGroups(groups = []) {
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups.map((group) => {
    const recommendedOffers = attachRecommendations(group.offers || []);

    const bestDealId = group.bestDeal?._id?.toString();

    const recommendedBestDeal =
      recommendedOffers.find(
        (offer) => offer._id?.toString() === bestDealId
      ) ||
      (group.bestDeal
        ? attachRecommendation(group.bestDeal)
        : null);

    return {
      ...group,
      offers: recommendedOffers,
      bestDeal: recommendedBestDeal,
    };
  });
}

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

// Fields a manual create may set: the scraped ones, not derived or bookkeeping fields.
const LISTING_WRITABLE_FIELDS = [
  "platform", "title", "platformProductId", "price", "originalPrice", "currency",
  "sourceUrl", "productUrl", "imageUrl", "brand", "category", "inStock", "isActive",
];

export async function createListing(req, res) {
  // Only these fields may be set by the caller. Spreading req.body let a request
  // set anything in the schema (isActive, lastScrapedAt, productCategory, ...).
  const listingData = {};
  for (const field of LISTING_WRITABLE_FIELDS) {
    if (req.body[field] !== undefined) listingData[field] = req.body[field];
  }
  listingData.normalizedTitle =
    req.body.normalizedTitle || normalizeTitle(req.body.title);

  const listing = await Listing.create(listingData);

  const historyResult = await recordPriceSnapshot(
    listing,
    {
      source: "listing_created",
      skipDuplicate: false,
    }
  );

  res.status(201).json({
    success: true,
    data: listing,
    priceHistory: historyResult,
  });
}

export async function getListings(req, res) {
  const paging = parsePagination(req.query);

  let query = Listing.find(VISIBLE_PLATFORMS_FILTER).sort({ createdAt: -1 });
  if (paging) query = query.skip(paging.skip).limit(paging.limit);

  const [listings, total] = await Promise.all([
    query,
    paging ? Listing.countDocuments(VISIBLE_PLATFORMS_FILTER) : null,
  ]);

  res.json({
    success: true,
    count: listings.length,
    ...(paging && {
      total,
      page: paging.page,
      limit: paging.limit,
      totalPages: Math.ceil(total / paging.limit),
    }),
    data: listings,
  });
}

/**
 * Headline numbers for the homepage. Counting on the server means the page
 * no longer downloads every listing just to show two figures.
 */
export async function getListingStats(req, res) {
  const [products, platforms] = await Promise.all([
    Listing.countDocuments(VISIBLE_PLATFORMS_FILTER),
    Listing.distinct("platform", VISIBLE_PLATFORMS_FILTER),
  ]);

  res.json({ success: true, products, platforms: platforms.length });
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

  const refreshResult = await fetchAndRefreshListings(trimmedQuery, {
  // Forcing a re-scrape bypasses the freshness window and costs a full round of
  // requests to every store, so it needs the admin key. Anyone else's
  // ?refresh=true is ignored: they simply get the normal cached behaviour.
  force: req.query.refresh === "true" && hasAdminKey(req),
  dynamic: false,
});

console.log("[search]", refreshResult);
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

  const rankedGroups =
    groupListingsByProduct(enrichedListings, { matchStrategy: resolveMatchStrategy(req) });

  const groups =
    attachRecommendationsToGroups(rankedGroups);

  const recommendedListings =
    createRecommendedListingArray(
      enrichedListings,
      groups
    );

  const prices = recommendedListings
    .map((listing) => Number(listing.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price > 0
    );

  const lowestPrice = prices.length
    ? Math.min(...prices)
    : null;

  const highestPrice = prices.length
    ? Math.max(...prices)
    : null;

  const averagePrice = prices.length
    ? Math.round(
        prices.reduce(
          (sum, price) => sum + price,
          0
        ) / prices.length
      )
    : null;

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

export async function getListingDetails(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw AppError.invalidId("Invalid listing ID");
  }

  const listing = await Listing.findOne({ _id: id, ...VISIBLE_PLATFORMS_FILTER });

  if (!listing) {
    throw AppError.notFound("Listing not found");
  }

  /*
   * Candidates for "the same product elsewhere": listings in the same
   * product category whose titles overlap this one, not every listing that
   * shares the coarse "Electronics" category. See selectCandidates.
   */
  const categoryPool = await Listing.find({
    ...VISIBLE_PLATFORMS_FILTER,
    productCategory: listing.productCategory || "other",
    _id: { $ne: listing._id },
  }).sort({ price: 1 });

  const possibleMatches = selectCandidates(listing, categoryPool);

  /*
   * Price history must be attached before grouping so the
   * fake-discount and deal-ranking engines can use it.
   */
  const enrichedMatches =
    await attachPriceHistory(possibleMatches);

  const rankedGroups =
    groupListingsByProduct(enrichedMatches, { matchStrategy: resolveMatchStrategy(req) });

  const recommendedGroups =
    attachRecommendationsToGroups(rankedGroups);

  const selectedGroup =
    recommendedGroups.find((group) =>
      (group.offers || []).some(
        (offer) =>
          offer._id?.toString() ===
          listing._id.toString()
      )
    ) || null;

  let offers;

  if (selectedGroup) {
    offers = selectedGroup.offers;
  } else {
    const enrichedListing =
      await attachPriceHistory([listing]);

    offers =
      attachRecommendations(enrichedListing);
  }

  const selectedListing =
    offers.find(
      (offer) =>
        offer._id?.toString() ===
        listing._id.toString()
    ) || attachRecommendation(listing);

  // An offer flagged as a probable listing error must not set the lowest price or
  // the "you can save" figure.
  const prices = offers
    .filter((offer) => !isSuspectPrice(offer))
    .map((offer) => Number(offer.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price > 0
    );

  const lowestPrice = prices.length
    ? Math.min(...prices)
    : null;

  const highestPrice = prices.length
    ? Math.max(...prices)
    : null;

  const averagePrice = prices.length
    ? Math.round(
        prices.reduce(
          (sum, price) => sum + price,
          0
        ) / prices.length
      )
    : null;

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

  res.json({
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
    offers,
  });
}

export async function addListingPriceHistory(
  req,
  res
) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw AppError.invalidId("Invalid listing ID");
  }

  const listing = await Listing.findById(id);

  if (!listing) {
    throw AppError.notFound("Listing not found");
  }

  const {
    price,
    originalPrice,
    recordedAt,
    source = "manual",
    updateListing = true,
  } = req.body;

  if (
    price === undefined ||
    price === null ||
    price === ""
  ) {
    throw AppError.badRequest("Price is required");
  }

  const historyResult =
    await recordPriceSnapshot(listing, {
      price,
      originalPrice,
      recordedAt:
        recordedAt || new Date(),
      source,
    });

  if (
    updateListing &&
    historyResult.created
  ) {
    listing.price = Number(price);

    if (
      originalPrice !== undefined &&
      originalPrice !== ""
    ) {
      listing.originalPrice =
        originalPrice === null
          ? null
          : Number(originalPrice);
    }

    listing.lastScrapedAt =
      recordedAt || new Date();

    await listing.save();
  }

  res
    .status(historyResult.created ? 201 : 200)
    .json({
      success: true,
      message: historyResult.reason,
      data: historyResult.snapshot,
      listing,
    });
}

export async function getListingHistory(
  req,
  res
) {
  const { id } = req.params;
  const { limit, days } = req.query;

  if (!mongoose.isValidObjectId(id)) {
    throw AppError.invalidId("Invalid listing ID");
  }

  const listing = await Listing.findById(
    id
  ).lean();

  if (!listing) {
    throw AppError.notFound("Listing not found");
  }

  const historyResult =
    await getListingPriceHistory(id, {
      limit,
      days,
    });

  res.json({
    success: true,
    listing: {
      id: listing._id,
      platform: listing.platform,
      title: listing.title,
      currentPrice: listing.price,
      originalPrice:
        listing.originalPrice ?? null,
      currency: listing.currency,
    },
    summary: historyResult.summary,
    data: historyResult.history,
  });
}