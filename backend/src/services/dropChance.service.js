// dropChance.service.js — the product page's "higher chance of a price drop this week", from the trained forecast (R2).
//
// The model (src/ml/forecast, logistic regression on a listing's own recorded prices) ranks how likely a price is to fall 3% or
// more within 7 days. Tested strictly (trained on days up to 21 Oct, tested on 29 Oct to 2 Nov), the 10% it ranked riskiest held
// 55% of the drops, 5.45 times the usual rate: but drops are rare (about 1 in 100), so even among those only about 1 in 26 fell.
// So the page never says a price will drop. It says only, for a price in that riskiest 10%, how much more often such prices
// dropped in the test, and how often that still was (the artifact's `flag`, written by 02-train-evaluate.js from the strict test).
// Nothing is shown when there is no strict test to quote, for a category the model was not trained on, for a price with under
// a week of records, or for anything out of stock.
//
// One feature is not worked out here: the share of the same store's prices that fell this week needs every listing's history.
// The training average is used for it, which makes it neutral (its weight is among the smallest).

import { readFileSync } from "node:fs";

import { CATEGORIES, FORECAST, dailySeries, featuresAt } from "../ml/forecast/features.js";
import { predictProba } from "../ml/logisticRegression.js";

const ARTIFACT = new URL("../ml/forecast/model.artifact.json", import.meta.url);

let model = null;
function loadModel() {
  if (model === null) {
    try {
      model = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    } catch {
      model = false; // no model: the page shows nothing
    }
  }
  return model || null;
}

/** For tests: use this artifact instead of the file. */
export function setDropModel(artifact) {
  model = artifact ?? null;
}

/**
 * @param {object} listing  a listing with `priceHistory` (historyEnrichment.service.js), `productCategory` and `inStock`
 * @returns {{lift: number, chance: number, share: number}|null}  only for a price in the riskiest `share`; null otherwise
 */
export function dropChance(listing, artifact = loadModel()) {
  if (!artifact?.flag || !listing || listing.inStock === false) return null;
  if (!CATEGORIES.includes(listing.productCategory)) return null;
  const series = dailySeries(listing.priceHistory ?? []);
  if (series.length < 2 || series.at(-1).day - series[0].day < FORECAST.MIN_HISTORY_DAYS) return null;

  const storeFell7 = artifact.means[artifact.featureNames.indexOf("storeFell7")];
  const features = featuresAt(series, series.length - 1, { category: listing.productCategory, storeFell7 });
  const score = predictProba(features, artifact);
  if (!(score >= artifact.flag.threshold)) return null;
  return { lift: artifact.flag.lift, chance: artifact.flag.precision, share: artifact.flag.share };
}
