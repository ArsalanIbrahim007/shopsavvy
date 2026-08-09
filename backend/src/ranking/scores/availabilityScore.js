/**
 * Availability score.
 *
 * Scrapers emit inStock (boolean); the seed path and future integrations may
 * emit an availability string. Both are supported, with an explicit neutral
 * score when neither is present — an unknown stock state should not earn full
 * marks, which is what the previous fallback did.
 */
export function calculateAvailabilityScore(offer = {}, weight = 10) {
  if (offer.isActive === false) return 0;

  const availability = offer.availability;

  if (availability === "in_stock") return weight;
  if (availability === "limited_stock") return Number((0.7 * weight).toFixed(2));
  if (availability === "out_of_stock") return 0;
  if (availability === "unknown") return Number((0.5 * weight).toFixed(2));

  if (offer.inStock === true) return weight;
  if (offer.inStock === false) return 0;

  return Number((0.5 * weight).toFixed(2));
}