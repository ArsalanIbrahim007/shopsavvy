import { calculatePriceScore } from "./scores/priceScore.js";
import { calculateFreshnessScore } from "./scores/freshnessScore.js";
import { calculateAvailabilityScore } from "./scores/availabilityScore.js";
import { calculateTrustScore } from "./scores/trustScore.js";
import { calculateFakeDiscountScore } from "./scores/fakeDiscountScore.js";
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

  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);

  return plainOffers
    .map((plainOffer) => {
      const priceScore = calculatePriceScore(
        plainOffer.price,
        minPrice,
        maxPrice,
        SCORE_WEIGHTS.price
      );

      const trustScore = calculateTrustScore(
        plainOffer.platform,
        SCORE_WEIGHTS.trust
      );

      const freshnessScore = calculateFreshnessScore(
        plainOffer.lastScrapedAt,
        SCORE_WEIGHTS.freshness
      );

      const availabilityScore = calculateAvailabilityScore(
        plainOffer,
        SCORE_WEIGHTS.availability
      );

      const discountAnalysis = calculateFakeDiscountScore({
        currentPrice: plainOffer.price,
        originalPrice: plainOffer.originalPrice,
        priceHistory: getOfferPriceHistory(plainOffer),
      });

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