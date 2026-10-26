// listing.controller.js — stored listings themselves: the paged list, and the admin-key writes (create a listing, record a
// price) with a listing's recorded prices. Search, feeds and the product page have their own controllers.

import mongoose from "mongoose";

import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";
import { parsePagination } from "../services/pagination.service.js";
import { getListingPriceHistory, recordPriceSnapshot } from "../services/priceHistory.service.js";

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
