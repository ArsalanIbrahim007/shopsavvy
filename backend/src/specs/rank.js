const BAND_SIZE = 10_000; // PKR

/**
 * @param {{ id: string, category: string, score: number, price: number }} product
 * @param {Array<{ id: string, score: number, price: number }>} others  — same category, any price
 * @returns {{ rank: number, of: number, band: { min: number, max: number } } | null}
 */
export function rankInBand(product, others) {
  if (!product || !product.price || !Number.isFinite(product.price) || product.price <= 0) return null;

  const bandMin = Math.floor(product.price / BAND_SIZE) * BAND_SIZE;
  const bandMax = bandMin + BAND_SIZE;

  const inBand = others.filter(
    (o) => Number.isFinite(o.price) && o.price >= bandMin && o.price < bandMax
  );

  const all = inBand.find((o) => o.id === product.id)
    ? inBand
    : [...inBand, product];

  all.sort((a, b) => b.score - a.score);

  const rank = all.findIndex((o) => o.id === product.id) + 1;

  return { rank, of: all.length, band: { min: bandMin, max: bandMax } };
}