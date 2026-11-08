import { calculatePriceScore } from "./scores/priceScore.js";
import { calculateFreshnessScore } from "./scores/freshnessScore.js";
import { calculateAvailabilityScore } from "./scores/availabilityScore.js";
import { calculateTrustScore } from "./scores/trustScore.js";
import { calculateFakeDiscountScore } from "./scores/fakeDiscountScore.js";
import { analyzeDiscountAnomaly } from "../services/discountAnomaly.service.js";
import { analyzePricePlausibility } from "../services/pricePlausibility.service.js";
import { fairPriceOf, fairPriceScore } from "../services/fairPrice.service.js";
import { SCORE_WEIGHTS } from "./scoreWeights.js";

/**
 * Extracts price-history entries from an offer.
 *
 * This supports multiple property names so the ranking engine remains
 * compatible with current and future PriceHistory structures.
 *
 * @param {object} offer
 * @returns {Array}
 */
function getOfferPriceHistory(offer = {}) {
  const possibleHistorySources = [
    offer.priceHistory,
    offer.history,
    offer.priceHistoryEntries,
  ];

  const validHistory = possibleHistorySources.find(Array.isArray);

  return validHistory || [];
}

/**
 * When a listing's own price history is too short to judge its claimed discount (2026-11-08: 54% of claims were "unverified", most
 * because the listing had fewer than three recorded prices), two other pieces of evidence are tried, in this order:
 *  1. the product's history at every store we track (the group's offers' histories together): the same product's price elsewhere;
 *  2. the fair price for its specs (services/fairPrice.service.js): a "was" price above the range the model saw for such products is
 *     suspicious, one at or below the fair price plus its usual error is likely genuine; in between it stays unverified.
 * The verdict says which evidence it rests on (discountAnalysis.basis), and its reason says so in words.
 */
export function judgeWithMoreEvidence(analysis, offer, { pooledHistory = [], fairPrice = null } = {}) {
  if (analysis?.classification !== "unverified_discount") return { ...analysis, basis: analysis?.classification === "no_claimed_discount" ? null : "listing_history" };

  const pooled = calculateFakeDiscountScore({ currentPrice: offer.price, originalPrice: offer.originalPrice, priceHistory: pooledHistory });
  if (pooled.classification !== "unverified_discount" && pooled.classification !== "insufficient_data") {
    return {
      ...pooled,
      basis: "product_history",
      reason: `Judged against this product's price history at every store we track (${pooled.metrics.historyCount} recorded prices), as this store's own is too short. ${pooled.reason}`,
    };
  }

  const was = Number(offer.originalPrice);
  if (fairPrice && was > 0) {
    const formatted = (n) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
    if (was > fairPrice.high) {
      return {
        ...analysis,
        classification: "suspicious",
        basis: "fair_price",
        reason: `The "was" price, ${formatted(was)}, is above what products with these specs usually cost: our price model puts them at ${formatted(fairPrice.price)}, and 9 in 10 at or under ${formatted(fairPrice.high)}. There is not enough price history to check the claim directly.`,
      };
    }
    if (was <= fairPrice.price * (1 + fairPrice.medianError)) {
      return {
        ...analysis,
        classification: "possibly_genuine",
        basis: "fair_price",
        reason: `The "was" price, ${formatted(was)}, is in line with what products with these specs usually cost (our price model puts them at ${formatted(fairPrice.price)}). There is not enough price history to verify the claim directly.`,
      };
    }
  }
  return { ...analysis, basis: "listing_history" };
}

/**
 * Calculates the weighted deal score and discount analysis for each offer.
 *
 * The fake-discount result is currently returned as analytical metadata.
 * It does not yet change the numerical deal score because reliable historical
 * data may not be available for every offer.
 *
 * @param {Array} offers
 * @returns {Array}
 */
export function calculateDealScores(offers = []) {
  if (!Array.isArray(offers) || offers.length === 0) {
    return [];
  }

  const plainOffers = offers.map((offer) =>
    offer?.toObject ? offer.toObject() : offer
  );

  const validPrices = plainOffers
    .map((offer) => Number(offer?.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (validPrices.length === 0) {
    return plainOffers.map((offer) => ({
      ...offer,
      dealScore: 0,
      scoreBreakdown: {
        price: 0,
        trust: 0,
        freshness: 0,
        availability: 0,
      },
      scoreWeights: SCORE_WEIGHTS,
      discountAnalysis: calculateFakeDiscountScore({
        currentPrice: offer?.price,
        originalPrice: offer?.originalPrice,
        priceHistory: getOfferPriceHistory(offer),
      }),
    }));
  }

  // Judge each price against the other stores first. An offer whose price looks
  // like a listing error must neither win on price nor stretch the range that
  // every honest store is scored against. (Flags nothing on today's catalogue;
  // see pricePlausibility.service.js.)
  const priceChecks = plainOffers.map((offer) => analyzePricePlausibility(offer, plainOffers));

  const believablePrices = plainOffers
    .filter((offer, index) => !priceChecks[index].status.startsWith("suspect"))
    .map((offer) => Number(offer.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  const scoringPrices = believablePrices.length > 0 ? believablePrices : validPrices;
  // the product's price history at every store, for a listing whose own is too short (judgeWithMoreEvidence)
  const pooledHistory = plainOffers.flatMap((offer) => getOfferPriceHistory(offer));
  const minPrice = Math.min(...scoringPrices);
  const maxPrice = Math.max(...scoringPrices);

  return plainOffers
    .map((plainOffer, index) => {
      const priceCheck = priceChecks[index];

      // The price part (2026-11-08): half against the other stores' prices for this product, half against the fair price for its specs
      // (the trained linear regression, services/fairPrice.service.js). A product only one store sells used to get a neutral half
      // mark whatever its price; it is now judged against the fair price alone. Without a trusted fair price, as before.
      // An implausibly cheap offer gets no price credit, so it cannot be crowned best deal.
      const fairPrice = fairPriceOf(plainOffer);
      const againstFair = fairPriceScore(plainOffer.price, fairPrice);
      const againstStores = calculatePriceScore(plainOffer.price, minPrice, maxPrice, 1);
      const priceShare = againstFair === null ? againstStores : minPrice === maxPrice ? againstFair : (againstStores + againstFair) / 2;
      const priceScore = priceCheck.status === "suspect_low" ? 0 : Number((priceShare * SCORE_WEIGHTS.price).toFixed(2));

      const trustScore = calculateTrustScore(plainOffer.platform, SCORE_WEIGHTS.trust, {
        rating: plainOffer.rating,
        reviewCount: plainOffer.reviewCount,
      });

      const freshnessScore = calculateFreshnessScore(
        plainOffer.lastScrapedAt,
        SCORE_WEIGHTS.freshness
      );

      const availabilityScore = calculateAvailabilityScore(
        plainOffer,
        SCORE_WEIGHTS.availability
      );

      const discountAnalysis = judgeWithMoreEvidence(
        calculateFakeDiscountScore({
          currentPrice: plainOffer.price,
          originalPrice: plainOffer.originalPrice,
          priceHistory: getOfferPriceHistory(plainOffer),
        }),
        plainOffer,
        { pooledHistory, fairPrice },
      );

      // Cross-store check: judges the claim against the other offers in this
      // same product group (always one product -- the only caller is
      // productGrouping.service.js). Extra evidence alongside the history-based
      // analysis above; it does not change isFakeDiscount or the deal score.
      const discountAnomaly = analyzeDiscountAnomaly(plainOffer, plainOffers);

      const scoreBreakdown = {
        price: priceScore,
        trust: trustScore,
        freshness: freshnessScore,
        availability: availabilityScore,
      };

      const finalScore =
        priceScore +
        trustScore +
        freshnessScore +
        availabilityScore;

      return {
        ...plainOffer,

        dealScore: Number(finalScore.toFixed(2)),

        scoreBreakdown,

        scoreWeights: SCORE_WEIGHTS,

        discountAnalysis,

        discountAnomaly,

        priceCheck,

        fairPrice,
      };
    })
    .sort((a, b) => b.dealScore - a.dealScore);
}

/**
 * Returns the highest-ranked offer.
 *
 * @param {Array} offers
 * @returns {object|null}
 */
export function getBestDeal(offers = []) {
  const rankedOffers = calculateDealScores(offers);

  return rankedOffers[0] || null;
}