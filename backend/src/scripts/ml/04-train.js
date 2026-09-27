// 04-train.js — trains the logistic regression classifier on the training
// split and writes the fitted weights as a checked-in model artifact.
//
// Usage: node src/scripts/ml/04-train.js
// Output: src/ml/model.artifact.json

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { buildFeatureVector, FEATURE_NAMES } from "../../ml/features.js";
import { trainLogisticRegression } from "../../ml/logisticRegression.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");
const ARTIFACT_PATH = join(__dirname, "..", "..", "ml", "model.artifact.json");

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

const artifact = {
  featureNames: FEATURE_NAMES,
  weights: model.weights,
  bias: model.bias,
  means: model.means,
  stds: model.stds,
  threshold: 0.5,
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
