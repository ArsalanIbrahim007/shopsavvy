// features.js — builds the feature vector for the trained matching
// classifier from a pair of listings. Every feature reuses an extractor
// that already exists in the rule-based pipeline; nothing here introduces
// new parsing logic.
//
// Tier words (pro/max/plus/...) are deliberately NOT a feature. Once a pair
// survives attributeConflict, tier equality is already guaranteed --
// sameSet(extractVariants(a), extractVariants(b)) is checked unconditionally,
// with no "unstated" exception unlike storage/RAM/screen/PTA -- so the
// column would have zero variance on every row the model ever sees.

import {
  modelTokens,
  extractStorage,
  extractScreenInches,
  extractPtaStatus,
  extractModelCodes,
} from "../services/normalizeTitle.service.js";
import { extractRamGb } from "../services/productAttributes.service.js";
import {
  tokenize,
  calculateJaccardSimilarity,
  VARIANT_TOKENS,
} from "../services/similarity.service.js";

export const FEATURE_NAMES = [
  "jaccardBase",
  "jaccardRaw",
  "storageMatch",
  "ramMatch",
  "screenMatch",
  "ptaMatch",
  "modelCodeMatch",
  "priceProximity",
  "titleLenDiff",
];

function baseTokensFor(title) {
  return tokenize(modelTokens(title))
    .filter((t) => !VARIANT_TOKENS.has(t))
    .join(" ");
}

// 1 = both sides state it and agree, -1 = both state it and disagree,
// 0 = at least one side doesn't state it (the constraint layer already
// decided whether that's disqualifying; the model only ever sees pairs
// that survived it).
function matchFlag(valueA, valueB, unknownValue = null) {
  if (valueA === unknownValue || valueB === unknownValue) return 0;
  return valueA === valueB ? 1 : -1;
}

function modelCodeMatchFlag(titleA, titleB) {
  const codesA = extractModelCodes(titleA);
  const codesB = extractModelCodes(titleB);
  if (codesA.size === 0 || codesB.size === 0) return 0;
  if (codesA.size !== codesB.size) return -1;
  for (const code of codesA) if (!codesB.has(code)) return -1;
  return 1;
}

// A missing price is "unknown," not "maximally different" -- returning 0
// here would read to the model as a strong negative signal (real training
// pairs, which always have both prices, learn that low proximity means
// different products), silently penalizing any comparison where price
// happens to be unavailable. 0.5 is neutral: it doesn't push the decision
// either way when there's nothing to compare.
function priceProximity(priceA, priceB) {
  if (!priceA || !priceB) return 0.5;
  const drift = Math.abs(priceA - priceB) / ((priceA + priceB) / 2);
  return 1 - Math.min(drift, 1);
}

/**
 * @param {{titleA:string, titleB:string, priceA?:number, priceB?:number}} pair
 * @returns {number[]} feature vector in FEATURE_NAMES order
 */
export function buildFeatureVector({ titleA, titleB, priceA = null, priceB = null }) {
  const baseA = baseTokensFor(titleA);
  const baseB = baseTokensFor(titleB);
  const lenA = tokenize(titleA).length;
  const lenB = tokenize(titleB).length;

  return [
    calculateJaccardSimilarity(baseA, baseB),
    calculateJaccardSimilarity(modelTokens(titleA), modelTokens(titleB)),
    matchFlag(extractStorage(titleA), extractStorage(titleB)),
    matchFlag(extractRamGb(titleA), extractRamGb(titleB)),
    matchFlag(extractScreenInches(titleA), extractScreenInches(titleB)),
    matchFlag(extractPtaStatus(titleA), extractPtaStatus(titleB), "unknown"),
    modelCodeMatchFlag(titleA, titleB),
    priceProximity(priceA, priceB),
    Math.abs(lenA - lenB) / Math.max(lenA, lenB, 1),
  ];
}
