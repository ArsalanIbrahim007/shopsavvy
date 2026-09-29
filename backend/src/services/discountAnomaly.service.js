// discountAnomaly.service.js — scores a discount claim against the other
// stores selling the same product, using the trained Isolation Forest in
// src/ml/discount/model.artifact.json. Runs alongside the history-based rule
// in fakeDiscountScore.js as extra evidence; it never overrides that rule's
// isFakeDiscount decision. See src/ml/discount/EVALUATION_REPORT.md.

import fs from "node:fs";
import { anomalyScore } from "../ml/isolationForest.js";
import { buildDiscountFeatures } from "../ml/discountFeatures.js";

const ARTIFACT = new URL("../ml/discount/model.artifact.json", import.meta.url);

let model = null;
try {
  model = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
} catch {
  // Not trained yet (e.g. a fresh clone before running the training script):
  // the service returns null and search results are simply unaffected.
  model = null;
}

// Beyond this, the store's *current* price is itself far above the market --
// which in practice means the matcher grouped a different variant with it
// (e.g. a 2TB unit with 256GB ones) or the store is simply overpriced (the
// deal score's price component already penalises that). Either way the group
// can't tell us whether the "was" price is honest, so the model abstains.
// 90% of real listings price within ~9% of their market median.
export const MAX_PRICE_OVER_MARKET = 1.25;

/**
 * Isolation Forest flags anything unusual, in either direction. The pattern
 * that actually means a fake discount: the store's current price is in line
 * with the market, but its claimed original price is above the highest price
 * any other store currently charges.
 * Feature indices (see discountFeatures.js): 1 = ln(original / market max),
 * 2 = ln(price / market median).
 */
export function matchesFakeDiscountPattern(features) {
  return features[1] > 0 && features[2] <= Math.log(MAX_PRICE_OVER_MARKET);
}

const pkr = (n) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

/**
 * @param {object} offer
 * @param {object[]} groupOffers every offer in the same product group
 * @returns {object|null} null when there's no model, no claimed discount, or
 *   no other store to compare against
 */
export function analyzeDiscountAnomaly(offer, groupOffers) {
  if (!model) return null;

  const built = buildDiscountFeatures(offer, groupOffers);
  if (!built) return null;

  const { features, context } = built;
  const score = anomalyScore(features, model);
  const single = context.comparators === 1;
  const stores = single ? "the other store" : `${context.comparators} other stores`;
  const charge = single ? "charges" : "charge";

  let status;
  let reason;
  if (context.price / context.marketMedian > MAX_PRICE_OVER_MARKET) {
    status = "not_comparable";
    reason = `This store's current price is far above what ${stores} ${charge}, so the listings may not be the same variant; the discount can't be judged against the market.`;
  } else if (score >= model.threshold && matchesFakeDiscountPattern(features)) {
    status = "anomalous";
    const aboveMax = (context.originalPrice / context.marketMax - 1) * 100;
    reason = `The claimed original price (${pkr(context.originalPrice)}) is ${aboveMax.toFixed(0)}% above the highest price ${stores} currently ${charge} for this product (${pkr(context.marketMax)}).`;
  } else {
    status = "consistent";
    reason = `The claimed original price is in line with what ${stores} currently ${charge} for this product.`;
  }

  return {
    status,
    isAnomalous: status === "anomalous",
    anomalyScore: Number(score.toFixed(3)),
    threshold: model.threshold,
    marketMedian: Math.round(context.marketMedian),
    marketMax: Math.round(context.marketMax),
    comparators: context.comparators,
    reason,
  };
}
