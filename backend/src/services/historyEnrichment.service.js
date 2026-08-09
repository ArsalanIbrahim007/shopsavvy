import PriceHistory from "../models/priceHistory.model.js";

/**
 * Flattens a PriceHistory document into a plain array of price points.
 *
 * Supports both storage shapes:
 *   - entries[]        (current shape, written by scrapers)
 *   - top-level price  (legacy shape, written before the July 28 model merge)
 */
function flattenHistoryDocument(doc = {}) {
  if (Array.isArray(doc.entries) && doc.entries.length > 0) {
    return doc.entries.map((entry) => ({
      price: entry.price,
      originalPrice: entry.originalPrice ?? null,
      recordedAt: entry.recordedAt,
    }));
  }

  if (doc.price !== null && doc.price !== undefined) {
    return [
      {
        price: doc.price,
        originalPrice: doc.originalPrice ?? null,
        recordedAt: doc.recordedAt ?? doc.createdAt,
      },
    ];
  }

  return [];
}

/**
 * Loads historical price records for each listing and attaches them
 * as a priceHistory array.
 *
 * Listings are matched to history on sourceUrl first (scraper-written
 * records carry no listing reference), then on the listing ObjectId.
 */
export async function attachPriceHistory(listings = []) {
  if (!Array.isArray(listings) || listings.length === 0) {
    return [];
  }

  const plainListings = listings.map((listing) =>
    listing.toObject ? listing.toObject() : listing
  );

  const sourceUrls = plainListings
    .map((listing) => listing.sourceUrl || listing.productUrl)
    .filter(Boolean);

  const listingIds = plainListings
    .map((listing) => listing._id)
    .filter(Boolean);

  const documents = await PriceHistory.find({
    $or: [
      { sourceUrl: { $in: sourceUrls } },
      { listing: { $in: listingIds } },
    ],
  }).lean();

  const historyByUrl = new Map();
  const historyByListingId = new Map();

  documents.forEach((document) => {
    const points = flattenHistoryDocument(document);

    if (document.sourceUrl) {
      historyByUrl.set(
        document.sourceUrl,
        (historyByUrl.get(document.sourceUrl) || []).concat(points)
      );
    }

    if (document.listing) {
      const key = document.listing.toString();
      historyByListingId.set(
        key,
        (historyByListingId.get(key) || []).concat(points)
      );
    }
  });

  return plainListings.map((listing) => {
    const urlKey = listing.sourceUrl || listing.productUrl;
    const idKey = listing._id?.toString();

    const combined = [
      ...(historyByUrl.get(urlKey) || []),
      ...(historyByListingId.get(idKey) || []),
    ];

    // A listing can match on both keys, so drop duplicate points.
    const seen = new Set();

    const priceHistory = combined
      .filter((point) => Number.isFinite(Number(point.price)))
      .filter((point) => {
        const signature = `${point.price}|${new Date(point.recordedAt).getTime()}`;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .sort(
        (first, second) =>
          new Date(first.recordedAt) - new Date(second.recordedAt)
      );

    return { ...listing, priceHistory };
  });
}