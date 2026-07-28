export function calculateAvailabilityScore(offer, weight = 10) {
  if (offer.isActive === false) return 0;

  if (offer.availability) {
    if (offer.availability === "in_stock") return weight;
    if (offer.availability === "limited_stock") return Number((0.7 * weight).toFixed(2));
    if (offer.availability === "unknown") return Number((0.5 * weight).toFixed(2));
    if (offer.availability === "out_of_stock") return 0;
  }

  return weight;
}