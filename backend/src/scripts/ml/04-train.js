// 04-train.js — trains the logistic regression classifier on the training
// split and writes the fitted weights as a checked-in model artifact.
//
// The decision threshold is chosen by grouped 5-fold cross-validation on the
// training pairs only (the test set is never consulted), maximising F0.5.
// F0.5 weights precision twice as heavily as recall because a wrong merge, which
// compares two different products, is worse for a shopper than a missed one. It
// also corrects for the training data being richer in same-product pairs than
// the live catalogue, where most candidate pairs are different products: at a
// default 0.5 the retrained model merged far too readily when regrouping the
// whole database.
//
// Usage: node src/scripts/ml/04-train.js [outputFile]
// Output: src/ml/<outputFile>, default model.artifact.json (the model the live API
// loads). Train candidates to a different file, e.g.
//   node src/scripts/ml/04-train.js model.artifact.v2-multicategory.json
// and promote one only after regrouping the whole database and reviewing the merges.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { buildFeatureVector, FEATURE_NAMES } from "../../ml/features.js";
import { trainLogisticRegression, predictProba } from "../../ml/logisticRegression.js";
import { pairComponents } from "../../ml/dataset/family.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");
const ARTIFACT_PATH = join(__dirname, "..", "..", "ml", process.argv[2] || "model.artifact.json");

const { train } = JSON.parse(readFileSync(join(DATASET_DIR, "split.json"), "utf8"));

const X = train.map((p) => buildFeatureVector({
  titleA: p.titleA, titleB: p.titleB, priceA: p.priceA, priceB: p.priceB,
}));
const y = train.map((p) => p.label);

const positiveCount = y.filter((v) => v === 1).length;
const negativeCount = y.length - positiveCount;

// Balanced class weighting: without it, gradient descent on 11 positives vs
// 71 negatives converges toward "always predict negative" -- a 87% accurate
// classifier that never once identifies a real match. Standard inverse-
// frequency weighting: rarer class gets a proportionally larger weight.
const classWeight = {
  1: train.length / (2 * positiveCount),
  0: train.length / (2 * negativeCount),
};

console.log(`Training on ${train.length} pairs (${positiveCount} positive, ${negativeCount} negative)`);
console.log("Class weights:", classWeight);

const model = trainLogisticRegression(X, y, { epochs: 5000, lr: 0.15, l2: 0.02, classWeight });

// --- Threshold selection: grouped 5-fold cross-validation on the training set.
const FOLDS = 5;
const BETA = 0.5;
const THRESHOLDS = Array.from({ length: 14 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(777);

const groups = pairComponents(train).map(([, members]) => members).sort(() => rng() - 0.5);
const folds = Array.from({ length: FOLDS }, () => []);
groups
  .sort((a, b) => b.length - a.length)
  .forEach((group) => {
    const smallest = folds.reduce((m, f, i) => (f.length < folds[m].length ? i : m), 0);
    folds[smallest].push(...group);
  });

const featuresOf = (p) => buildFeatureVector({ titleA: p.titleA, titleB: p.titleB, priceA: p.priceA, priceB: p.priceB });
const outOfFold = [];
folds.forEach((holdout, k) => {
  const fit = folds.filter((_, i) => i !== k).flat();
  const yFit = fit.map((p) => p.label);
  const pos = yFit.filter((v) => v === 1).length;
  const cw = { 1: fit.length / (2 * pos), 0: fit.length / (2 * (fit.length - pos)) };
  const m = trainLogisticRegression(fit.map(featuresOf), yFit, { epochs: 5000, lr: 0.15, l2: 0.02, classWeight: cw });
  holdout.forEach((p) => outOfFold.push({ label: p.label, prob: predictProba(featuresOf(p), m) }));
});

function fBeta(threshold) {
  let tp = 0, fp = 0, fn = 0;
  outOfFold.forEach(({ label, prob }) => {
    const predicted = prob >= threshold ? 1 : 0;
    if (predicted && label) tp++;
    else if (predicted && !label) fp++;
    else if (!predicted && label) fn++;
  });
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const denom = BETA * BETA * precision + recall;
  return { precision, recall, f: denom === 0 ? 0 : ((1 + BETA * BETA) * precision * recall) / denom };
}

const sweep = THRESHOLDS.map((t) => ({ threshold: t, ...fBeta(t) }));
// Ties go to the higher threshold: prefer the more conservative merge.
const chosen = sweep.reduce((best, row) => (row.f >= best.f ? row : best), sweep[0]);

console.log(`
Grouped ${FOLDS}-fold CV on ${train.length} training pairs, maximising F${BETA}:`);
console.table(sweep.map((r) => ({ threshold: r.threshold, precision: r.precision.toFixed(3), recall: r.recall.toFixed(3), [`F${BETA}`]: r.f.toFixed(3) })));
console.log(`Chosen threshold: ${chosen.threshold}`);

const artifact = {
  featureNames: FEATURE_NAMES,
  weights: model.weights,
  bias: model.bias,
  means: model.means,
  stds: model.stds,
  threshold: chosen.threshold,
  thresholdSelection: {
    method: `grouped ${FOLDS}-fold cross-validation on the training pairs, maximising F${BETA}`,
    crossValidatedPrecision: Number(chosen.precision.toFixed(3)),
    crossValidatedRecall: Number(chosen.recall.toFixed(3)),
  },
  trainedAt: new Date().toISOString(),
  trainingSize: train.length,
  classWeight,
};

writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

console.log("\nLearned weights (standardized scale):");
console.table(
  FEATURE_NAMES.map((name, i) => ({ feature: name, weight: model.weights[i].toFixed(4) }))
);
console.log("bias:", model.bias.toFixed(4));
console.log(`\nWrote ${ARTIFACT_PATH}`);
