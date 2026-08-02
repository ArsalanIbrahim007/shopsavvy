export function normalizeValue(value, min, max, reverse = false) {
  if (value === null || value === undefined) return 0;

  if (max === min) return 1;

  const normalized = (value - min) / (max - min);

  return reverse ? 1 - normalized : normalized;
}

export function calculatePriceScore(price, minPrice, maxPrice, weight = 70) {
  const rawScore = normalizeValue(price, minPrice, maxPrice, true);

  return Number((rawScore * weight).toFixed(2));
}