/**
 * Fake Discount Detection Engine
 *
 * Determines whether a retailer's claimed discount appears genuine.
 *
 * Inputs:
 * - currentPrice
 * - originalPrice
 * - priceHistory
 *
 * The engine compares:
 * - Claimed original price
 * - Current price
 * - Historical average
 * - Historical median
 * - Historical lowest price
 *
 * This service does not access MongoDB directly.
 * It only evaluates the data provided to it.
 */

const DEFAULT_CONFIG = Object.freeze({
  minimumHistoryEntries: 3,

  // If the claimed original price is more than 20% above the historical
  // reference price, the discount becomes suspicious.
  originalPriceInflationThreshold: 0.2,

  // Current price must be at least 5% below the historical reference price
  // before the discount is considered historically meaningful.
  meaningfulHistoricalDiscountThreshold: 0.05,

  // A claimed discount below 3% is treated as insignificant.
  minimumMeaningfulClaimedDiscount: 0.03,
});

/**
 * Converts a value into a valid positive number.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toPositiveNumber(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

/**
 * Rounds a number to two decimal places.
 *
 * @param {number} value
 * @returns {number}
 */
function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Restricts a value to a specified range.
 *
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Calculates the median of an array of numbers.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function calculateMedian(values) {
  if (!values.length) {
    return null;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (
      sortedValues[middleIndex - 1] + sortedValues[middleIndex]
    ) / 2;
  }

  return sortedValues[middleIndex];
}

/**
 * Extracts valid prices from different possible history formats.
 *
 * Supported examples:
 *
 * [269999, 265000, 259999]
 *
 * [
 *   { price: 269999, date: "2026-07-01" },
 *   { price: 259999, recordedAt: "2026-07-20" }
 * ]
 *
 * @param {unknown[]} priceHistory
 * @returns {number[]}
 */
function extractHistoricalPrices(priceHistory = []) {
  if (!Array.isArray(priceHistory)) {
    return [];
  }

  return priceHistory
    .map((entry) => {
      if (typeof entry === "number" || typeof entry === "string") {
        return toPositiveNumber(entry);
      }

      if (entry && typeof entry === "object") {
        return toPositiveNumber(
          entry.price ??
            entry.currentPrice ??
            entry.amount ??
            entry.value
        );
      }

      return null;
    })
    .filter((price) => price !== null);
}

/**
 * Creates a standard response when the engine cannot properly evaluate
 * the discount.
 *
 * @param {string} reason
 * @param {object} input
 * @returns {object}
 */
function createInsufficientDataResult(reason, input = {}) {
  return {
    isFakeDiscount: false,
    classification: "insufficient_data",
    discountAuthenticityScore: 50,
    fakeDiscountRisk: 50,
    confidence: 0,
    claimedDiscountPercent: 0,
    historicalDiscountPercent: null,
    reason,
    signals: {
      hasCurrentPrice: Boolean(input.currentPrice),
      hasOriginalPrice: Boolean(input.originalPrice),
      hasSufficientHistory: false,
      originalPriceInflated: null,
      currentPriceBelowHistoricalReference: null,
    },
    metrics: {
      currentPrice: input.currentPrice ?? null,
      originalPrice: input.originalPrice ?? null,
      historicalAverage: null,
      historicalMedian: null,
      historicalLowest: null,
      historicalHighest: null,
      historicalReferencePrice: null,
      historyCount: 0,
    },
  };
}

/**
 * Evaluates whether a claimed discount is genuine.
 *
 * @param {object} input
 * @param {number} input.currentPrice
 * @param {number} [input.originalPrice]
 * @param {Array} [input.priceHistory]
 * @param {object} [customConfig]
 * @returns {object}
 */
function calculateFakeDiscountScore(input = {}, customConfig = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...customConfig,
  };

  const currentPrice = toPositiveNumber(
    input.currentPrice ?? input.price
  );

  const originalPrice = toPositiveNumber(input.originalPrice);

  const historicalPrices = extractHistoricalPrices(
    input.priceHistory ?? input.history ?? []
  );

  if (!currentPrice) {
    return createInsufficientDataResult(
      "A valid current price is required to evaluate the discount.",
      {
        currentPrice,
        originalPrice,
      }
    );
  }

  if (!originalPrice || originalPrice <= currentPrice) {
    return {
      isFakeDiscount: false,
      classification: "no_claimed_discount",
      discountAuthenticityScore: 100,
      fakeDiscountRisk: 0,
      confidence: 100,
      claimedDiscountPercent: 0,
      historicalDiscountPercent: null,
      reason:
        "The retailer is not claiming a valid discount because the original price is missing or is not higher than the current price.",
      signals: {
        hasCurrentPrice: true,
        hasOriginalPrice: Boolean(originalPrice),
        hasSufficientHistory:
          historicalPrices.length >= config.minimumHistoryEntries,
        originalPriceInflated: false,
        currentPriceBelowHistoricalReference: null,
      },
      metrics: {
        currentPrice,
        originalPrice,
        historicalAverage: null,
        historicalMedian: null,
        historicalLowest: null,
        historicalHighest: null,
        historicalReferencePrice: null,
        historyCount: historicalPrices.length,
      },
    };
  }

  const claimedDiscountRatio =
    (originalPrice - currentPrice) / originalPrice;

  const claimedDiscountPercent = roundToTwo(
    claimedDiscountRatio * 100
  );

  if (
    historicalPrices.length < config.minimumHistoryEntries
  ) {
    const authenticityScore =
      claimedDiscountRatio >=
      config.minimumMeaningfulClaimedDiscount
        ? 60
        : 75;

    return {
      isFakeDiscount: false,
      classification: "unverified_discount",
      discountAuthenticityScore: authenticityScore,
      fakeDiscountRisk: 100 - authenticityScore,
      confidence: 30,
      claimedDiscountPercent,
      historicalDiscountPercent: null,
      reason:
        "A discount is being claimed, but there is not enough historical price data to verify whether it is genuine.",
      signals: {
        hasCurrentPrice: true,
        hasOriginalPrice: true,
        hasSufficientHistory: false,
        originalPriceInflated: null,
        currentPriceBelowHistoricalReference: null,
      },
      metrics: {
        currentPrice,
        originalPrice,
        historicalAverage: null,
        historicalMedian: null,
        historicalLowest:
          historicalPrices.length > 0
            ? Math.min(...historicalPrices)
            : null,
        historicalHighest:
          historicalPrices.length > 0
            ? Math.max(...historicalPrices)
            : null,
        historicalReferencePrice: null,
        historyCount: historicalPrices.length,
      },
    };
  }

  const historicalAverage =
    historicalPrices.reduce(
      (total, price) => total + price,
      0
    ) / historicalPrices.length;

  const historicalMedian =
    calculateMedian(historicalPrices);

  const historicalLowest = Math.min(...historicalPrices);
  const historicalHighest = Math.max(...historicalPrices);

  /*
   * Median is used as the primary historical reference because it is less
   * affected by unusually high or low prices than the average.
   */
  const historicalReferencePrice =
    historicalMedian ?? historicalAverage;

  const originalPriceInflationRatio =
    (originalPrice - historicalReferencePrice) /
    historicalReferencePrice;

  const historicalDiscountRatio =
    (historicalReferencePrice - currentPrice) /
    historicalReferencePrice;

  const historicalDiscountPercent = roundToTwo(
    historicalDiscountRatio * 100
  );

  const originalPriceInflated =
    originalPriceInflationRatio >
    config.originalPriceInflationThreshold;

  const currentPriceBelowHistoricalReference =
    historicalDiscountRatio >=
    config.meaningfulHistoricalDiscountThreshold;

  let fakeDiscountRisk = 0;
  const reasons = [];

  /*
   * Signal 1:
   * Claimed original price is unusually higher than the product's normal
   * historical price.
   */
  if (originalPriceInflated) {
    const inflationPenalty = clamp(
      originalPriceInflationRatio * 100,
      20,
      50
    );

    fakeDiscountRisk += inflationPenalty;

    reasons.push(
      "The claimed original price is significantly higher than the product's typical historical price."
    );
  }

  /*
   * Signal 2:
   * Current price is not meaningfully lower than the normal historical price.
   */
  if (!currentPriceBelowHistoricalReference) {
    fakeDiscountRisk += 35;

    reasons.push(
      "The current price is not meaningfully lower than its typical historical price."
    );
  } else {
    reasons.push(
      "The current price is lower than the product's typical historical price."
    );
  }

  /*
   * Signal 3:
   * Retailer claims a large discount, but historical evidence shows only a
   * small or nonexistent reduction.
   */
  const discountDifference =
    claimedDiscountRatio -
    Math.max(historicalDiscountRatio, 0);

  if (discountDifference >= 0.15) {
    fakeDiscountRisk += 25;

    reasons.push(
      "The advertised discount is much larger than the discount supported by historical prices."
    );
  } else if (discountDifference >= 0.08) {
    fakeDiscountRisk += 15;

    reasons.push(
      "The advertised discount is moderately higher than the discount supported by historical prices."
    );
  }

  /*
   * Signal 4:
   * A current price equal to or above previous normal prices is a strong
   * indication that the discount may only be promotional wording.
   */
  if (currentPrice >= historicalAverage) {
    fakeDiscountRisk += 15;

    reasons.push(
      "The current price is equal to or higher than the historical average."
    );
  }

  fakeDiscountRisk = roundToTwo(
    clamp(fakeDiscountRisk, 0, 100)
  );

  const discountAuthenticityScore = roundToTwo(
    100 - fakeDiscountRisk
  );

  let classification = "genuine_discount";

  if (fakeDiscountRisk >= 70) {
    classification = "likely_fake";
  } else if (fakeDiscountRisk >= 45) {
    classification = "suspicious";
  } else if (fakeDiscountRisk >= 25) {
    classification = "possibly_genuine";
  }

  const isFakeDiscount = fakeDiscountRisk >= 70;

  /*
   * Confidence increases as more history becomes available.
   * It is capped because this is a rule-based prediction, not absolute proof.
   */
  const confidence = roundToTwo(
    clamp(
      50 + historicalPrices.length * 5,
      50,
      95
    )
  );

  return {
    isFakeDiscount,
    classification,
    discountAuthenticityScore,
    fakeDiscountRisk,
    confidence,
    claimedDiscountPercent,
    historicalDiscountPercent,
    reason: reasons.join(" "),
    signals: {
      hasCurrentPrice: true,
      hasOriginalPrice: true,
      hasSufficientHistory: true,
      originalPriceInflated,
      currentPriceBelowHistoricalReference,
    },
    metrics: {
      currentPrice,
      originalPrice,
      historicalAverage: roundToTwo(historicalAverage),
      historicalMedian: roundToTwo(historicalMedian),
      historicalLowest: roundToTwo(historicalLowest),
      historicalHighest: roundToTwo(historicalHighest),
      historicalReferencePrice: roundToTwo(
        historicalReferencePrice
      ),
      originalPriceInflationPercent: roundToTwo(
        originalPriceInflationRatio * 100
      ),
      historyCount: historicalPrices.length,
    },
  };
}

export {
  calculateFakeDiscountScore,
  extractHistoricalPrices,
};