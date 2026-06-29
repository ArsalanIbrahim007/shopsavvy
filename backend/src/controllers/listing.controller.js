import Listing from "../models/listing.model.js";
import { groupListingsByProduct } from "../services/productGrouping.service.js";
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createListing(req, res) {
  try {
    const listingData = {
      ...req.body,
      normalizedTitle: req.body.normalizedTitle || normalizeText(req.body.title),
    };

    const listing = await Listing.create(listingData);

    res.status(201).json({
      success: true,
      data: listing,
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
    const listings = await Listing.find().sort({ createdAt: -1 });

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
        message: "Search query is required. Example: /api/listings/search?q=iphone",
      });
    }

    const normalizedQuery = normalizeText(q);

    const listings = await Listing.find({
      $or: [
        { title: { $regex: q, $options: "i" } },
        { normalizedTitle: { $regex: normalizedQuery, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { platform: { $regex: q, $options: "i" } },
      ],
    }).sort({ price: 1, createdAt: -1 });

    const prices = listings.map((listing) => listing.price);

    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : null;

    const averagePrice =
      prices.length > 0
        ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        : null;

const bestDeal = listings.length > 0 ? listings[0] : null;
const platforms = [...new Set(listings.map((listing) => listing.platform))];
const groups = groupListingsByProduct(listings);

res.json({
  success: true,
  query: q,
  count: listings.length,
  groupCount: groups.length,
  summary: {
    platforms: platforms.length,
    lowestPrice,
    highestPrice,
    averagePrice,
    bestDealPlatform: bestDeal ? bestDeal.platform : null,
    bestDealTitle: bestDeal ? bestDeal.title : null,
  },
  groups,
  data: listings,
});
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}