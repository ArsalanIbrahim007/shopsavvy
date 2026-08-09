import mongoose from "mongoose";

import Listing from "../models/listing.model.js";
import { attachPriceHistory } from "../services/historyEnrichment.service.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";
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

export async function createListing(req, res) {
  try {
    const listingData = {
      ...req.body,
      normalizedTitle:
        req.body.normalizedTitle ||
        normalizeTitle(req.body.title),
    };

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
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getListings(req, res) {
  try {
    const listings = await Listing.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      count: listings.length,
      data: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function searchListings(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({
        success: false,
        message:
          "Search query is required. Example: /api/listings/search?q=iphone",
      });
    }
    const refreshResult = await fetchAndRefreshListings(q, {
    force: req.query.refresh === "true",
    dynamic: false,
});

console.log("[search]", refreshResult);
    const normalizedQuery = normalizeTitle(q);

    const listings = await Listing.find({
      $or: [
        {
          title: {
            $regex: q,
            $options: "i",
          },
        },
        {
          normalizedTitle: {
            $regex: normalizedQuery,
            $options: "i",
          },
        },
        {
          category: {
            $regex: q,
            $options: "i",
          },
        },
        {
          platform: {
            $regex: q,
            $options: "i",
          },
        },
      ],
    }).sort({
      price: 1,
      createdAt: -1,
    });

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
      groupListingsByProduct(enrichedListings);

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

    const bestDeal =
      groups
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getListingDetails(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const normalizedQuery = normalizeTitle(
      listing.normalizedTitle || listing.title
    );

    const firstTitleWord =
      listing.title?.split(" ")[0] || "";

    const possibleMatches = await Listing.find({
      $or: [
        {
          normalizedTitle: {
            $regex: normalizedQuery,
            $options: "i",
          },
        },
        {
          title: {
            $regex: firstTitleWord,
            $options: "i",
          },
        },
        {
          category: listing.category,
        },
      ],
    }).sort({
      price: 1,
    });

    /*
     * Price history must be attached before grouping so the
     * fake-discount and deal-ranking engines can use it.
     */
    const enrichedMatches =
      await attachPriceHistory(possibleMatches);

    const rankedGroups =
      groupListingsByProduct(enrichedMatches);

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

    const prices = offers
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function addListingPriceHistory(
  req,
  res
) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
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
      return res.status(400).json({
        success: false,
        message: "Price is required",
      });
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
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getListingHistory(
  req,
  res
) {
  try {
    const { id } = req.params;
    const { limit, days } = req.query;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    const listing = await Listing.findById(
      id
    ).lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}