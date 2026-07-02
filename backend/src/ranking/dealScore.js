function normalizeValue(value, min, max, reverse = false) {
  if (value === null || value === undefined) return 0;

  if (max === min) return 1;

  const normalized = (value - min) / (max - min);

  return reverse ? 1 - normalized : normalized;
}

export function calculateDealScores(offers = []) {
  if (!offers.length) return [];

  const prices = offers.map((offer) => offer.price || 0);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return offers
    .map((offer) => {
      // Lower price = higher score
      const priceScore = normalizeValue(
        offer.price,
        minPrice,
        maxPrice,
        true
      );

      // Freshness (placeholder for now)
      const freshnessScore = offer.lastScrapedAt ? 1 : 0.5;

      // Active listing score
      const availabilityScore = offer.isActive ? 1 : 0;

      // Weighted final score
      const finalScore =
        priceScore * 0.7 +
        freshnessScore * 0.2 +
        availabilityScore * 0.1;

      return {
        ...(offer.toObject ? offer.toObject() : offer),
        dealScore: Number((finalScore * 100).toFixed(2)),
      };
    })
    .sort((a, b) => b.dealScore - a.dealScore);
}

export function getBestDeal(offers = []) {
  const rankedOffers = calculateDealScores(offers);
  return rankedOffers[0] || null;
}