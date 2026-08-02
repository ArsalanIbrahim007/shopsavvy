import PriceHistory from "../models/priceHistory.model.js";

/**
 * Converts an input into a valid positive number.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePositiveNumber(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

/**
 * Records a price snapshot for a listing.
 *
 * Duplicate consecutive snapshots are skipped when the price and
 * original price have not changed.
 *
 * @param {object} listing
 * @param {object} options
 * @returns {Promise<object>}
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

  const validOriginalPrice =
    originalPrice === null ||
    originalPrice === undefined ||
    originalPrice === ""
      ? null
      : parsePositiveNumber(originalPrice);

  if (
    originalPrice !== null &&
    originalPrice !== undefined &&
    originalPrice !== "" &&
    validOriginalPrice === null
  ) {
    throw new Error(
      "Original price must be a valid non-negative number"
    );
  }

  if (skipDuplicate) {
    const latestSnapshot = await PriceHistory.findOne({
      listing: listing._id,
    }).sort({
      recordedAt: -1,
    });

    const latestOriginalPrice =
      latestSnapshot?.originalPrice ?? null;

    if (
      latestSnapshot &&
      latestSnapshot.price === validPrice &&
      latestOriginalPrice === validOriginalPrice
    ) {
      return {
        created: false,
        snapshot: latestSnapshot,
        reason: "Price has not changed",
      };
    }
  }

  const snapshot = await PriceHistory.create({
    listing: listing._id,
    platform: listing.platform,
    platformProductId: listing.platformProductId || "",
    price: validPrice,
    originalPrice: validOriginalPrice,
    currency: listing.currency || "PKR",
    recordedAt,
    source,
  });

  return {
    created: true,
    snapshot,
    reason: "Price snapshot recorded",
  };
}

/**
 * Returns price-history records and calculated summary information.
 *
 * @param {string} listingId
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function getListingPriceHistory(
  listingId,
  {
    limit = 100,
    days = null,
  } = {}
) {
  const parsedLimit = Math.min(
    Math.max(Number(limit) || 100, 1),
    500
  );

  const query = {
    listing: listingId,
  };

  if (days !== null && days !== undefined) {
    const parsedDays = Number(days);

    if (Number.isFinite(parsedDays) && parsedDays > 0) {
      const startDate = new Date();

      startDate.setDate(startDate.getDate() - parsedDays);

      query.recordedAt = {
        $gte: startDate,
      };
    }
  }

  const history = await PriceHistory.find(query)
    .sort({
      recordedAt: 1,
    })
    .limit(parsedLimit)
    .lean();

  const prices = history
    .map((entry) => Number(entry.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price >= 0
    );

  const lowestPrice =
    prices.length > 0 ? Math.min(...prices) : null;

  const highestPrice =
    prices.length > 0 ? Math.max(...prices) : null;

  const averagePrice =
    prices.length > 0
      ? Number(
          (
            prices.reduce(
              (sum, price) => sum + price,
              0
            ) / prices.length
          ).toFixed(2)
        )
      : null;

  const latestEntry =
    history.length > 0
      ? history[history.length - 1]
      : null;

  const earliestEntry =
    history.length > 0 ? history[0] : null;

  const priceChange =
    latestEntry && earliestEntry
      ? Number(
          (
            latestEntry.price -
            earliestEntry.price
          ).toFixed(2)
        )
      : null;

  const priceChangePercent =
    latestEntry &&
    earliestEntry &&
    earliestEntry.price > 0
      ? Number(
          (
            ((latestEntry.price -
              earliestEntry.price) /
              earliestEntry.price) *
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
      latestRecordedAt:
        latestEntry?.recordedAt ?? null,
      earliestRecordedAt:
        earliestEntry?.recordedAt ?? null,
    },
  };
}