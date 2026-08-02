const RECOMMENDATION_THRESHOLDS = {
  BUY_NOW: 85,
  GOOD_DEAL: 70,
  FAIR_PRICE: 50,
  WAIT: 35,
};

const RECOMMENDATION_ACTIONS = {
  BUY_NOW: "BUY_NOW",
  GOOD_DEAL: "GOOD_DEAL",
  FAIR_PRICE: "FAIR_PRICE",
  WAIT: "WAIT",
  OVERPRICED: "OVERPRICED",
  NO_HISTORY: "NO_HISTORY",
};

const clamp = (value, minimum = 0, maximum = 100) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return minimum;
  }

  return Math.min(Math.max(numericValue, minimum), maximum);
};

const roundNumber = (value, decimals = 2) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number(numericValue.toFixed(decimals));
};

const getHistoryPrices = (priceHistory = []) => {
  if (!Array.isArray(priceHistory)) {
    return [];
  }

  return priceHistory
    .map((record) => Number(record?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
};

const calculateHistorySummary = (
  priceHistory = [],
  currentPrice = 0
) => {
  const historicalPrices =
    getHistoryPrices(priceHistory);

  const validCurrentPrice =
    Number(currentPrice);

  const comparisonPrices = [
    ...historicalPrices,
  ];

  if (
    Number.isFinite(validCurrentPrice) &&
    validCurrentPrice > 0 &&
    !comparisonPrices.includes(validCurrentPrice)
  ) {
    comparisonPrices.push(validCurrentPrice);
  }

  if (comparisonPrices.length === 0) {
    return {
      historyCount: 0,
      lowestPrice: null,
      highestPrice: null,
      averagePrice: null,
      currentPricePosition: null,
    };
  }

  const lowestPrice =
    Math.min(...comparisonPrices);

  const highestPrice =
    Math.max(...comparisonPrices);

  const averagePrice =
    comparisonPrices.reduce(
      (total, price) => total + price,
      0
    ) / comparisonPrices.length;

  let currentPricePosition = null;

  if (
    Number.isFinite(validCurrentPrice) &&
    validCurrentPrice > 0 &&
    highestPrice !== lowestPrice
  ) {
    currentPricePosition =
      ((validCurrentPrice - lowestPrice) /
        (highestPrice - lowestPrice)) *
      100;
  } else if (
    Number.isFinite(validCurrentPrice) &&
    validCurrentPrice === lowestPrice
  ) {
    currentPricePosition = 0;
  }

  return {
    historyCount: historicalPrices.length,
    lowestPrice: roundNumber(lowestPrice),
    highestPrice: roundNumber(highestPrice),
    averagePrice: roundNumber(averagePrice),
    currentPricePosition:
      currentPricePosition === null
        ? null
        : roundNumber(
            clamp(currentPricePosition)
          ),
  };
};

const calculateEstimatedSavings = ({
  currentPrice,
  originalPrice,
  averagePrice,
}) => {
  const price = Number(currentPrice);
  const original = Number(originalPrice);
  const average = Number(averagePrice);

  if (!Number.isFinite(price) || price <= 0) {
    return 0;
  }

  if (Number.isFinite(original) && original > price) {
    return roundNumber(original - price);
  }

  if (Number.isFinite(average) && average > price) {
    return roundNumber(average - price);
  }

  return 0;
};

const getDiscountClassification = (discountAnalysis = {}) => {
  return (
    discountAnalysis?.classification ||
    discountAnalysis?.status ||
    "no_discount_data"
  );
};

const buildReason = ({
  action,
  historySummary,
  discountClassification,
  estimatedSavings,
}) => {
  const isLowestRecordedPrice =
    historySummary.lowestPrice !== null &&
    historySummary.currentPricePosition === 0;

  const reasons = {
    BUY_NOW: isLowestRecordedPrice
      ? "The current price is the lowest recorded price and the overall deal score is excellent."
      : "The product has an excellent deal score and offers strong value compared with other available offers.",

    GOOD_DEAL:
      estimatedSavings > 0
        ? `The offer provides estimated savings of ${estimatedSavings} compared with its reference price.`
        : "The price and overall deal quality make this offer worth considering.",

    FAIR_PRICE:
      "The offer is reasonably priced, but it is not significantly better than the available alternatives.",

    WAIT:
      "The current price is not especially attractive compared with its available price history.",

    OVERPRICED:
      "The current offer appears expensive compared with its historical price or competing offers.",

    NO_HISTORY:
      "There is not enough historical price data to make a strong buying recommendation.",
  };

  let reason = reasons[action] || reasons.FAIR_PRICE;

  if (
    discountClassification === "fake_discount" ||
    discountClassification === "suspicious_discount"
  ) {
    reason =
      "The advertised discount appears suspicious, so the offer should be reviewed carefully before purchasing.";
  }

  if (discountClassification === "unverified_discount") {
    reason += " The advertised discount is still unverified.";
  }

  return reason;
};

const calculateConfidence = ({
  dealScore,
  historyCount,
  trustScore,
  discountClassification,
}) => {
  let confidence = 50;

  const validDealScore = Number(dealScore);
  const validTrustScore = Number(trustScore);

  if (Number.isFinite(validDealScore)) {
    confidence += (validDealScore - 50) * 0.35;
  }

  if (Number.isFinite(validTrustScore)) {
    confidence += (validTrustScore - 50) * 0.2;
  }

  if (historyCount >= 5) {
    confidence += 15;
  } else if (historyCount >= 2) {
    confidence += 7;
  } else {
    confidence -= 10;
  }

  if (
    discountClassification === "fake_discount" ||
    discountClassification === "suspicious_discount"
  ) {
    confidence -= 20;
  }

  if (discountClassification === "unverified_discount") {
    confidence -= 8;
  }

  return Math.round(clamp(confidence));
};

const determineRecommendationAction = ({
  dealScore,
  historySummary,
  discountClassification,
}) => {
  const score = Number(dealScore);

  if (
    discountClassification === "fake_discount" ||
    discountClassification === "suspicious_discount"
  ) {
    return RECOMMENDATION_ACTIONS.WAIT;
  }

  if (historySummary.historyCount < 2) {
    return RECOMMENDATION_ACTIONS.NO_HISTORY;
  }

  if (!Number.isFinite(score)) {
    return RECOMMENDATION_ACTIONS.FAIR_PRICE;
  }

  const isNearLowestRecordedPrice =
    historySummary.currentPricePosition !== null &&
    historySummary.currentPricePosition <= 20;

  const isNearHighestRecordedPrice =
    historySummary.currentPricePosition !== null &&
    historySummary.currentPricePosition >= 80;

if (
  score >= RECOMMENDATION_THRESHOLDS.BUY_NOW &&
  isNearLowestRecordedPrice &&
  historySummary.historyCount >= 5
) {
  return RECOMMENDATION_ACTIONS.BUY_NOW;
}

  if (score >= RECOMMENDATION_THRESHOLDS.GOOD_DEAL) {
    return RECOMMENDATION_ACTIONS.GOOD_DEAL;
  }

  if (score >= RECOMMENDATION_THRESHOLDS.FAIR_PRICE) {
    return RECOMMENDATION_ACTIONS.FAIR_PRICE;
  }

  if (
    score >= RECOMMENDATION_THRESHOLDS.WAIT &&
    !isNearHighestRecordedPrice
  ) {
    return RECOMMENDATION_ACTIONS.WAIT;
  }

  return RECOMMENDATION_ACTIONS.OVERPRICED;
};

export const generateRecommendation = (listing = {}) => {
  const currentPrice = Number(listing.price);
  const originalPrice = Number(listing.originalPrice);
  const dealScore = Number(
    listing.dealScore ?? listing.ranking?.dealScore ?? listing.score
  );

  const trustScore = Number(
    listing.trustScore ??
      listing.scoreBreakdown?.trustScore ??
      listing.ranking?.trustScore
  );

  const discountAnalysis =
    listing.discountAnalysis ?? listing.ranking?.discountAnalysis ?? {};

  const priceHistory = Array.isArray(listing.priceHistory)
    ? listing.priceHistory
    : [];

  const historySummary = calculateHistorySummary(
    priceHistory,
    currentPrice
  );

  const discountClassification =
    getDiscountClassification(discountAnalysis);

  const estimatedSavings = calculateEstimatedSavings({
    currentPrice,
    originalPrice,
    averagePrice: historySummary.averagePrice,
  });

  const action = determineRecommendationAction({
    dealScore,
    historySummary,
    discountClassification,
  });

  const confidence = calculateConfidence({
    dealScore,
    historyCount: historySummary.historyCount,
    trustScore,
    discountClassification,
  });

  const reason = buildReason({
    action,
    historySummary,
    discountClassification,
    estimatedSavings,
  });

  return {
    action,
    confidence,
    reason,
    estimatedSavings,
    historySummary,
  };
};

export const attachRecommendation = (listing = {}) => {
  return {
    ...listing,
    recommendation: generateRecommendation(listing),
  };
};

export const attachRecommendations = (listings = []) => {
  if (!Array.isArray(listings)) {
    return [];
  }

  return listings.map((listing) => attachRecommendation(listing));
};

export {
  RECOMMENDATION_ACTIONS,
  RECOMMENDATION_THRESHOLDS,
};