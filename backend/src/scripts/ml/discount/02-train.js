// 02-train.js — trains the production discount anomaly model on every row of
// the dataset (Isolation Forest is unsupervised: it learns what "normal"
// discount claims look like and needs no labels). The held-out evaluation in
// 03-evaluate.js trains its own forest on a train split with these exact
// hyperparameters, so the numbers reported there describe this model.
//
// Usage: node src/scripts/ml/discount/02-train.js

import fs from "node:fs";
import { trainIsolationForest, anomalyScore } from "../../../ml/isolationForest.js";
import { HYPERPARAMS, SCORE_THRESHOLD } from "../../../ml/discount/config.js";

const DATASET = new URL("../../../ml/discount/dataset.json", import.meta.url);
const ARTIFACT = new URL("../../../ml/discount/model.artifact.json", import.meta.url);

const { featureNames, rows, builtAt } = JSON.parse(fs.readFileSync(DATASET, "utf8"));
const X = rows.map((r) => r.features);

const model = trainIsolationForest(X, HYPERPARAMS);
const scores = X.map((x) => anomalyScore(x, model)).sort((a, b) => a - b);
const q = (p) => scores[Math.floor(p * (scores.length - 1))].toFixed(3);

fs.writeFileSync(
  ARTIFACT,
  JSON.stringify({
    kind: "isolation-forest",
    trainedAt: new Date().toISOString(),
    datasetBuiltAt: builtAt,
    trainingRows: X.length,
    featureNames,
    hyperparams: HYPERPARAMS,
    threshold: SCORE_THRESHOLD,
    ...model,
  })
);

console.log(`Trained on ${X.length} rows (${featureNames.length} features), ${HYPERPARAMS.trees} trees, subsample ${model.sampleSize}.`);
console.log(`Training score distribution: p10 ${q(0.1)}  p50 ${q(0.5)}  p90 ${q(0.9)}  max ${q(1)}`);
console.log(`Artifact written (${(fs.statSync(ARTIFACT).size / 1024).toFixed(0)} KB).`);
