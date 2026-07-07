import Listing from "../models/listing.model.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";
import { groupListingsByProduct } from "../services/productGrouping.service.js";


export async function createListing(req, res) {
  try {
    const listingData = {
      ...req.body,
      normalizedTitle: req.body.normalizedTitle || normalizeTitle(req.body.title),
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

    const normalizedQuery = normalizeTitle(q);

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
export async function getListingDetails(req, res) {
  try {
    const { id } = req.params;

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

    const possibleMatches = await Listing.find({
      $or: [
        { normalizedTitle: { $regex: normalizedQuery, $options: "i" } },
        { title: { $regex: listing.title.split(" ")[0], $options: "i" } },
        { category: listing.category },
      ],
    }).sort({ price: 1 });

    const groups = groupListingsByProduct(possibleMatches);

    const selectedGroup =
      groups.find((group) =>
        group.offers.some(
          (offer) => offer._id.toString() === listing._id.toString()
        )
      ) || null;

    const offers = selectedGroup ? selectedGroup.offers : [listing];

    const prices = offers.map((offer) => offer.price).filter(Boolean);

    const lowestPrice = prices.length ? Math.min(...prices) : null;
    const highestPrice = prices.length ? Math.max(...prices) : null;
    const averagePrice = prices.length
      ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
      : null;

    const platforms = [...new Set(offers.map((offer) => offer.platform))];

    res.json({
      success: true,
      listing,
      productGroup: selectedGroup,
      summary: {
        platforms: platforms.length,
        lowestPrice,
        highestPrice,
        averagePrice,
        bestDealPlatform: selectedGroup?.bestDeal?.platform || listing.platform,
        bestDealTitle: selectedGroup?.bestDeal?.title || listing.title,
        bestDealScore: selectedGroup?.bestDeal?.dealScore || null,
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