// similarityModel.service.js — the trained-classifier alternative to the
// fixed-threshold Jaccard decision in similarity.service.js. Not wired into
// the live API by default (see productGrouping.service.js's matchStrategy
// parameter) -- this exists for the side-by-side comparison in
// src/scripts/ml/06-compare-grouping.js and test-grouping-ml.js. Flipping
// the live default is a deliberate one-line change for later, after the
// team has reviewed the evaluation numbers in src/ml/EVALUATION_REPORT.md.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { buildFeatureVector } from "../ml/features.js";
import { predictProba } from "../ml/logisticRegression.js";
import { attributeConflict } from "./similarity.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = join(__dirname, "..", "ml", "model.artifact.json");

let model = null;
function loadModel() {
  if (!model) {
    model = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  }
  return model;
}

/**
 * Classifies a title pair as the same product using the trained model.
 * The attribute-constraint veto stays an absolute pre-filter -- a known
 * fact (differing stated storage, PTA status, etc.) is never left to the
 * model to overrule, exactly as in the rule-based isSimilarProduct.
 *
 * @param {{title:string, price?:number}} itemA
 * @param {{title:string, price?:number}} itemB
 * @returns {{isMatch: boolean, probability: number}}
 */
export function classifyPairML(itemA, itemB) {
  if (attributeConflict(itemA.title, itemB.title, { ignoreUnstatedStorage: true })) {
    return { isMatch: false, probability: 0 };
  }

  const loadedModel = loadModel();
  const features = buildFeatureVector({
    titleA: itemA.title,
    titleB: itemB.title,
    priceA: itemA.price ?? null,
    priceB: itemB.price ?? null,
  });
  const probability = predictProba(features, loadedModel);

  return { isMatch: probability >= loadedModel.threshold, probability };
}

/**
 * Same signature as productGrouping.service.js's ruleMatchStrategy, so it
 * can be passed as groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy }).
 */
export function mlMatchStrategy(rawTitle, group, listing) {
  const groupPrice = group.lowestPrice != null && group.highestPrice != null
    ? (group.lowestPrice + group.highestPrice) / 2
    : null;

  return classifyPairML(
    { title: rawTitle, price: listing.price },
    { title: group.rawGroupKey, price: groupPrice }
  ).isMatch;
}
