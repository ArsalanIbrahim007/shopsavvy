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
import { FILLER_WORDS } from "./fillerWords.js";

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

// Features added for the multi-category candidate models. They target the failure
// the original nine cannot see: two titles that are almost identical apart from
// one model identifier ("Reno 5K" / "Reno 5Z", "Honor 7X" / "Honor 7i") score a
// high Jaccard, so text similarity alone says "same product".
//   coreJaccard    Jaccard over tokens with store filler (colours, warranty
//                  wording) removed, so filler stops inflating or hiding overlap
//   coreOverlap    shared filler-free tokens over the shorter title's, which a
//                  long padded title does not dilute
//   coreDiffCount  how many filler-free tokens are in one title but not the
//                  other (capped, scaled to 0..1)
//   idDiffCount    the same, counting only tokens that contain a digit and are
//                  not capacities or sizes: these are the model identifiers
export const EXTENDED_FEATURE_NAMES = [
  ...["jaccardBase", "jaccardRaw", "storageMatch", "ramMatch", "screenMatch", "ptaMatch", "modelCodeMatch", "priceProximity", "titleLenDiff"],
  "coreJaccard",
  "coreOverlap",
  "coreDiffCount",
  "idDiffCount",
];

const SPEC_TOKEN = /^\d+(gb|tb|mm|inch|hz|mah|mp|w|kg|ton|k|p|g)$/;

function coreTokens(title) {
  return new Set(tokenize(modelTokens(title)).filter((t) => !FILLER_WORDS.has(t)));
}

function symmetricDifference(a, b) {
  const out = [];
  for (const t of a) if (!b.has(t)) out.push(t);
  for (const t of b) if (!a.has(t)) out.push(t);
  return out;
}

function coreFeatures(titleA, titleB) {
  const a = coreTokens(titleA);
  const b = coreTokens(titleB);
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  const smaller = Math.min(a.size, b.size);
  const diff = symmetricDifference(a, b);
  const idDiff = diff.filter((t) => /\d/.test(t) && !SPEC_TOKEN.test(t));

  return {
    coreJaccard: union ? shared / union : 0,
    coreOverlap: smaller ? shared / smaller : 0,
    coreDiffCount: Math.min(diff.length, 6) / 6,
    idDiffCount: Math.min(idDiff.length, 4) / 4,
  };
}

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

// minCodeLength: 4 is the definition this model was trained on. The veto in
// similarity.service.js also recognises 3-character codes; widening this
// feature too would shift the model's inputs away from its training data
// (retraining on the small, phone-heavy labeled set was tried and made
// whole-DB grouping worse -- see context.md).
function modelCodeMatchFlag(titleA, titleB) {
  const codesA = extractModelCodes(titleA, { minCodeLength: 4 });
  const codesB = extractModelCodes(titleB, { minCodeLength: 4 });
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
 * @param {string[]} [featureNames] which features to build, in order. Defaults to
 *   the original nine, so the production model's inputs are unchanged; a model
 *   trained on the extended set records its own list in its artifact.
 * @returns {number[]} feature vector in featureNames order
 */
export function buildFeatureVector(pair, featureNames = FEATURE_NAMES) {
  const base = buildBaseFeatures(pair);
  if (featureNames === FEATURE_NAMES) return base;

  const named = Object.fromEntries(FEATURE_NAMES.map((name, i) => [name, base[i]]));
  Object.assign(named, coreFeatures(pair.titleA, pair.titleB));
  return featureNames.map((name) => named[name]);
}

function buildBaseFeatures({ titleA, titleB, priceA = null, priceB = null }) {
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
