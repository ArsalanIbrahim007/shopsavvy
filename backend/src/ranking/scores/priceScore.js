export function normalizeValue(value, min, max, reverse = false) {
  if (value === null || value === undefined) return 0;

  if (max === min) return 1;

  const normalized = (value - min) / (max - min);

  return reverse ? 1 - normalized : normalized;
}

/**
 * Price competitiveness, scored against the other offers in the same group.
 *
 * When a group holds only one offer there is nothing to compare against, so
 * price competitiveness is unknown and the offer receives a neutral score.
 * Awarding full marks in that case made every single-offer listing tie at the
 * top of the ranking regardless of price.
 */
export function calculatePriceScore(price, minPrice, maxPrice, weight = 60) {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return 0;
  }

  if (minPrice === maxPrice) {
    return Number((0.5 * weight).toFixed(2));
  }

  const rawScore = normalizeValue(numericPrice, minPrice, maxPrice, true);

  return Number((rawScore * weight).toFixed(2));
}