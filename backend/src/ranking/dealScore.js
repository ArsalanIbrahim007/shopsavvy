function normalizeValue(value, min, max, reverse = false) {
  if (value === null || value === undefined) return 0;

  if (max === min) return 1;

  const normalized = (value - min) / (max - min);

  return reverse ? 1 - normalized : normalized;
}

function calculateFreshnessScore(lastScrapedAt) {
  if (!lastScrapedAt) return 0.5;

  const scrapedDate = new Date(lastScrapedAt);
  const now = new Date();

  const ageInHours = (now - scrapedDate) / (1000 * 60 * 60);

  if (ageInHours <= 24) return 1;
  if (ageInHours <= 72) return 0.75;
  if (ageInHours <= 168) return 0.5;

  return 0.25;
}

function calculateAvailabilityScore(offer) {
  if (offer.isActive === false) return 0;

  if (offer.availability) {
    if (offer.availability === "in_stock") return 1;
    if (offer.availability === "limited_stock") return 0.7;
    if (offer.availability === "unknown") return 0.5;
    if (offer.availability === "out_of_stock") return 0;
  }

  return 1;
}

export function calculateDealScores(offers = []) {
  if (!offers.length) return [];

  const prices = offers.map((offer) => offer.price || 0);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return offers
    .map((offer) => {
      const plainOffer = offer.toObject ? offer.toObject() : offer;

      const priceScore = normalizeValue(
        plainOffer.price,
        minPrice,
        maxPrice,
        true
      );

      const freshnessScore = calculateFreshnessScore(plainOffer.lastScrapedAt);
      const availabilityScore = calculateAvailabilityScore(plainOffer);

      const scoreBreakdown = {
        price: Number((priceScore * 70).toFixed(2)),
        freshness: Number((freshnessScore * 20).toFixed(2)),
        availability: Number((availabilityScore * 10).toFixed(2)),
      };

      const finalScore =
        scoreBreakdown.price +
        scoreBreakdown.freshness +
        scoreBreakdown.availability;

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