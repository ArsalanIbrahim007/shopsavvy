import PriceHistory from "../models/priceHistory.model.js";
import Listing from "../models/listing.model.js";

function parsePositiveNumber(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

/**
 * PriceHistory requires a sourceUrl. Seeded listings only carry productUrl,
 * so fall back through both before synthesising a stable internal identifier.
 */
function resolveSourceUrl(listing) {
  return (
    listing?.sourceUrl ||
    listing?.productUrl ||
    `internal://listing/${listing?._id}`
  );
}

/**
 * Records a price snapshot for a listing.
 *
 * Writes into the entries[] array defined by the PriceHistory model, and
 * backfills the listing reference so history can be joined by ObjectId as
 * well as by sourceUrl.
 */
export async function recordPriceSnapshot(
  listing,
  {
    price = listing?.price,
    originalPrice = listing?.originalPrice,
    recordedAt = new Date(),
    source = "manual",
    skipDuplicate = true,
  } = {}
) {
  if (!listing?._id) {
    throw new Error("A valid listing is required");
  }

  const validPrice = parsePositiveNumber(price);

  if (validPrice === null) {
    throw new Error("A valid non-negative price is required");
  }

  const hasOriginalPrice =
    originalPrice !== null &&
    originalPrice !== undefined &&
    originalPrice !== "";

  const validOriginalPrice = hasOriginalPrice
    ? parsePositiveNumber(originalPrice)
    : null;

  if (hasOriginalPrice && validOriginalPrice === null) {
    throw new Error("Original price must be a valid non-negative number");
  }

  const sourceUrl = resolveSourceUrl(listing);
  const title = listing.title || "Untitled listing";

  const newEntry = {
    price: validPrice,
    originalPrice: validOriginalPrice,
    inStock: listing.inStock ?? true,
    recordedAt: new Date(recordedAt),
  };

  let document = await PriceHistory.findOne({
    platform: listing.platform,
    sourceUrl,
  });

  if (!document) {
    document = await PriceHistory.create({
      listing: listing._id,
      platform: listing.platform,
      platformProductId: listing.platformProductId || "",
      sourceUrl,
      title,
      currency: listing.currency || "PKR",
      source,
      entries: [newEntry],
      currentPrice: validPrice,
      lowestPrice: validPrice,
      highestPrice: validPrice,
      lastScrapedAt: newEntry.recordedAt,
    });

    return {
      created: true,
      snapshot: newEntry,
      document,
      reason: "Price snapshot recorded",
    };
  }

  if (!document.listing) {
    document.listing = listing._id;
  }

  const lastEntry = document.entries[document.entries.length - 1];

  const unchanged =
    lastEntry &&
    lastEntry.price === validPrice &&
    (lastEntry.originalPrice ?? null) === validOriginalPrice;

  if (skipDuplicate && unchanged) {
    await document.save();

    return {
      created: false,
      snapshot: lastEntry,
      document,
      reason: "Price has not changed",
    };
  }

  document.entries.push(newEntry);
  document.currentPrice = validPrice;
  document.lowestPrice = Math.min(document.lowestPrice ?? validPrice, validPrice);
  document.highestPrice = Math.max(document.highestPrice ?? validPrice, validPrice);
  document.lastScrapedAt = newEntry.recordedAt;
  document.title = title;
  document.source = source;

  await document.save();

  return {
    created: true,
    snapshot: newEntry,
    document,
    reason: "Price snapshot recorded",
  };
}

/**
 * Returns price-history records and calculated summary information.
 *
 * Matches on the listing reference and on sourceUrl, then flattens both the
 * entries[] shape and the legacy top-level shape into one timeline.
 */
export async function getListingPriceHistory(
  listingId,
  { limit = 100, days = null } = {}
) {
  const parsedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const listing = await Listing.findById(listingId).lean();

  const matchConditions = [{ listing: listingId }];
  const sourceUrl = listing?.sourceUrl || listing?.productUrl;

  if (sourceUrl) {
    matchConditions.push({ sourceUrl });
  }

  const documents = await PriceHistory.find({ $or: matchConditions }).lean();

  let history = [];

  documents.forEach((document) => {
    if (Array.isArray(document.entries) && document.entries.length > 0) {
      history.push(
        ...document.entries.map((entry) => ({
          price: entry.price,
          originalPrice: entry.originalPrice ?? null,
          recordedAt: entry.recordedAt,
        }))
      );
      return;
    }

    if (document.price !== null && document.price !== undefined) {
      history.push({
        price: document.price,
        originalPrice: document.originalPrice ?? null,
        recordedAt: document.recordedAt ?? document.createdAt,
      });
    }
  });

  if (days !== null && days !== undefined) {
    const parsedDays = Number(days);

    if (Number.isFinite(parsedDays) && parsedDays > 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parsedDays);

      history = history.filter(
        (entry) => new Date(entry.recordedAt) >= startDate
      );
    }
  }

  history = history
    .filter((entry) => Number.isFinite(Number(entry.price)))
    .sort(
      (first, second) =>
        new Date(first.recordedAt) - new Date(second.recordedAt)
    )
    .slice(0, parsedLimit);

  const prices = history.map((entry) => Number(entry.price));

  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const highestPrice = prices.length > 0 ? Math.max(...prices) : null;

  const averagePrice =
    prices.length > 0
      ? Number(
          (prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2)
        )
      : null;

  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const earliestEntry = history.length > 0 ? history[0] : null;

  const priceChange =
    latestEntry && earliestEntry
      ? Number((latestEntry.price - earliestEntry.price).toFixed(2))
      : null;

  const priceChangePercent =
    latestEntry && earliestEntry && earliestEntry.price > 0
      ? Number(
          (
            ((latestEntry.price - earliestEntry.price) / earliestEntry.price) *
            100
          ).toFixed(2)
        )
      : null;

  return {
    history,
    summary: {
      historyCount: history.length,
      lowestPrice,
      highestPrice,
      averagePrice,
      latestPrice: latestEntry?.price ?? null,
      earliestPrice: earliestEntry?.price ?? null,
      priceChange,
      priceChangePercent,
      latestRecordedAt: latestEntry?.recordedAt ?? null,
      earliestRecordedAt: earliestEntry?.recordedAt ?? null,
    },
  };
}