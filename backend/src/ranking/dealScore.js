import { calculatePriceScore } from "./scores/priceScore.js";
import { calculateFreshnessScore } from "./scores/freshnessScore.js";
import { calculateAvailabilityScore } from "./scores/availabilityScore.js";
import { calculateTrustScore } from "./scores/trustScore.js";

const SCORE_WEIGHTS = {
  price: 60,
  trust: 20,
  freshness: 10,
  availability: 10,
};

export function calculateDealScores(offers = []) {
  if (!offers.length) return [];

  const prices = offers.map((offer) => offer.price || 0);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return offers
    .map((offer) => {
      const plainOffer = offer.toObject ? offer.toObject() : offer;

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

      const scoreBreakdown = {
        price: priceScore,
        trust: trustScore,
        freshness: freshnessScore,
        availability: availabilityScore,
      };

      const finalScore =
        priceScore + trustScore + freshnessScore + availabilityScore;

      return {
        ...plainOffer,
        dealScore: Number(finalScore.toFixed(2)),
        scoreBreakdown,
        scoreWeights: SCORE_WEIGHTS,
      };
    })
    .sort((a, b) => b.dealScore - a.dealScore);
}

export function getBestDeal(offers = []) {
  const rankedOffers = calculateDealScores(offers);
  return rankedOffers[0] || null;
}