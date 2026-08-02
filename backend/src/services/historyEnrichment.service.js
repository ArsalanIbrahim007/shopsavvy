import PriceHistory from "../models/priceHistory.model.js";

/**
 * Loads historical price records for each listing and attaches them
 * as a priceHistory array.
 */
export async function attachPriceHistory(listings = []) {
  if (!Array.isArray(listings) || listings.length === 0) {
    return [];
  }

  const listingIds = listings.map((listing) => listing._id);

  const history = await PriceHistory.find({
    listing: { $in: listingIds },
  })
    .sort({ recordedAt: 1 })
    .lean();

  const historyMap = new Map();

  history.forEach((entry) => {
    const key = entry.listing.toString();

    if (!historyMap.has(key)) {
      historyMap.set(key, []);
    }

    historyMap.get(key).push({
      price: entry.price,
      originalPrice: entry.originalPrice,
      recordedAt: entry.recordedAt,
    });
  });

  return listings.map((listing) => {
    const plainListing = listing.toObject
      ? listing.toObject()
      : listing;

    return {
      ...plainListing,
      priceHistory:
        historyMap.get(plainListing._id.toString()) || [],
    };
  });
}