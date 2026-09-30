// pricePlausibility.service.js — is this offer's price believable next to what
// other stores charge for the same product?
//
// A misparsed price (a missing digit, a price for a different pack size, a
// stale cached value) is worse than a missing one: if it is too LOW it wins
// "best deal" and drags every honest store's price score down, and if it is too
// HIGH it inflates the "you can save" figure. This compares an offer with the
// median of the OTHER offers in its product group.
//
// Thresholds were set from the real catalogue (2026-09-30, 404 offers in groups
// of three or more): 369 sat within 0.8x to 1.25x of the median of the others,
// and none was below 0.5x or above 2x. So the limits sit well outside honest
// variation (capacity and PTA differences, a store's own pricing) and flag
// almost nothing on today's data; they are a guard, not a filter. The matcher's
// price-proximity feature already keeps wildly different prices out of a group,
// so this mostly matters when matching is title-driven.
//
// Like the discount checks, it abstains rather than guesses: with fewer than two
// other offers, or when those offers disagree with each other, it says so.

export const LOW_RATIO = 0.5;
export const HIGH_RATIO = 2.0;
export const MIN_COMPARATORS = 2;
// If the other offers differ from each other by more than this, they are not a
// reliable yardstick (mixed variants), so the check abstains.
export const MAX_REFERENCE_SPREAD = 1.5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const sameOffer = (a, b) =>
  a === b || (a?._id != null && b?._id != null && String(a._id) === String(b._id));

/**
 * @param {{price:number}} offer
 * @param {Array<{price:number}>} groupOffers every offer of the same product, including `offer`
 * @returns {{status: "plausible"|"suspect_low"|"suspect_high"|"not_comparable",
 *            ratio: number|null, referencePrice: number|null, comparators: number, reason: string}}
 */
export function analyzePricePlausibility(offer, groupOffers = []) {
  const price = Number(offer?.price);
  const others = groupOffers
    .filter((other) => !sameOffer(other, offer))
    .map((other) => Number(other?.price))
    .filter((value) => Number.isFinite(value) && value > 0);

  const abstain = (reason) => ({
    status: "not_comparable",
    ratio: null,
    referencePrice: null,
    comparators: others.length,
    reason,
  });

  if (!Number.isFinite(price) || price <= 0) return abstain("This offer has no valid price to check.");
  if (others.length < MIN_COMPARATORS) {
    return abstain(`Needs at least ${MIN_COMPARATORS} other stores selling this product to check the price.`);
  }
  if (Math.max(...others) / Math.min(...others) > MAX_REFERENCE_SPREAD) {
    return abstain("The other stores' prices differ too much from each other to judge this one.");
  }

  const referencePrice = Math.round(median(others));
  const ratio = price / referencePrice;
  const result = { ratio: Number(ratio.toFixed(2)), referencePrice, comparators: others.length };

  if (ratio < LOW_RATIO) {
    return {
      status: "suspect_low",
      ...result,
      reason: `This price is ${Math.round((1 - ratio) * 100)}% below what ${others.length} other stores charge (PKR ${referencePrice.toLocaleString()}), which is unusually low and may be a listing error.`,
    };
  }

  if (ratio > HIGH_RATIO) {
    return {
      status: "suspect_high",
      ...result,
      reason: `This price is ${ratio.toFixed(1)} times what ${others.length} other stores charge (PKR ${referencePrice.toLocaleString()}), which is unusually high and may be a listing error.`,
    };
  }

  return {
    status: "plausible",
    ...result,
    reason: `In line with the ${others.length} other stores selling this product.`,
  };
}

/** True for an offer that should not be treated as a real price (best deal, lowest price, price bounds). */
export const isSuspectPrice = (offer) => offer?.priceCheck?.status?.startsWith("suspect") === true;
