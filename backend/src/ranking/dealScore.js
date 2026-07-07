import { calculatePriceScore } from "./scores/priceScore.js";
import { calculateFreshnessScore } from "./scores/freshnessScore.js";
import { calculateAvailabilityScore } from "./scores/availabilityScore.js";

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
        maxPrice
      );

      const freshnessScore = calculateFreshnessScore(
        plainOffer.lastScrapedAt
      );

      const availabilityScore = calculateAvailabilityScore(
        plainOffer
      );

      const scoreBreakdown = {
        price: priceScore,
        freshness: freshnessScore,
        availability: availabilityScore,
      };

      const finalScore =
        priceScore +
        freshnessScore +
        availabilityScore;

      return {
        ...plainOffer,
        dealScore: Number(finalScore.toFixed(2)),
        scoreBreakdown,
        scoreWeights: {
          price: 70,
          freshness: 20,
          availability: 10,
        },
      };
    })
    .sort((a, b) => b.dealScore - a.dealScore);
}

export function getBestDeal(offers = []) {
  const rankedOffers = calculateDealScores(offers);
  return rankedOffers[0] || null;
}