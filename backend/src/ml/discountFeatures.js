// discountFeatures.js — turns one discount-claiming offer into a feature
// vector by comparing it against the *other* stores selling the same
// product right now. The key idea: a fake discount is a "was" price the
// product never really sold at, and the market price at other stores is a
// reference that exists today, without needing weeks of per-listing
// history (which ~98% of listings still don't have).
//
// Every feature is a ratio, so a PKR 30,000 phone and a PKR 400,000 TV
// land on the same scale. Log ratios keep "2x above" and "2x below" the
// same distance from 0, which matters for the uniform random splits
// Isolation Forest draws.

export const DISCOUNT_FEATURE_NAMES = [
  "logOriginalVsMedian", // ln(claimed original / median current price elsewhere)
  "logOriginalVsMax",    // ln(claimed original / highest current price elsewhere)
  "logPriceVsMedian",    // ln(current price / median current price elsewhere)
  "claimedDiscount",     // (original - price) / original
];

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sameOffer(a, b) {
  if (a === b) return true;
  if (a?._id && b?._id) return String(a._id) === String(b._id);
  return Boolean(a?.sourceUrl) && a.sourceUrl === b?.sourceUrl && a.platform === b?.platform;
}

/**
 * @param {object} offer the offer being evaluated
 * @param {object[]} groupOffers every offer in its product group (may include `offer` itself)
 * @returns {{features: number[], context: object} | null} null when the
 *   offer claims no discount or there's no other store to compare against
 */
export function buildDiscountFeatures(offer, groupOffers = []) {
  const price = positive(offer?.price);
  const original = positive(offer?.originalPrice);
  if (!price || !original || original <= price) return null;

  const otherPrices = groupOffers
    .filter((o) => !sameOffer(o, offer))
    .map((o) => positive(o?.price))
    .filter(Boolean);
  if (otherPrices.length === 0) return null;

  const marketMedian = median(otherPrices);
  const marketMax = Math.max(...otherPrices);

  return {
    features: [
      Math.log(original / marketMedian),
      Math.log(original / marketMax),
      Math.log(price / marketMedian),
      (original - price) / original,
    ],
    context: {
      price,
      originalPrice: original,
      marketMedian,
      marketMax,
      comparators: otherPrices.length,
    },
  };
}
