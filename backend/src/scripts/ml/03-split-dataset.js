// 03-split-dataset.js — stratified 75/25 train/test split of the trainable
// pool (positive + hard_negative_ambiguous + easy_negative_same_category),
// keeping hard_negative_veto and easy_negative_cross_category out of
// training entirely -- attributeConflict already vetoes those pairs
// deterministically before the model ever runs, so training on them would
// teach the model a region of feature space it's structurally forbidden
// from being asked about at inference time. They're reserved for the final
// evaluation set instead, to prove the ML path doesn't regress on cases the
// rules already solve perfectly.
//
// Usage: node src/scripts/ml/03-split-dataset.js
// Output: src/ml/dataset/split.json

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261120);

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const TRAINABLE_POOLS = new Set([
  "positive", "hard_negative_ambiguous", "easy_negative_same_category",
  // Targeted follow-up mining (_mine_gap_examples.js) for patterns the
  // random sample under-represented: quote-mark vs "inch" formatting,
  // RAM-stated-once, and bare-vs-specific with a small price drift.
  "gap_quote_vs_inch", "gap_ram_stated_once", "gap_bare_small_drift",
]);

const labeled = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.labeled.json"), "utf8"));

const trainable = labeled.filter((p) => TRAINABLE_POOLS.has(p.pool));
const evalOnly = labeled.filter((p) => !TRAINABLE_POOLS.has(p.pool));

const positives = shuffle(trainable.filter((p) => p.label === 1));
const negatives = shuffle(trainable.filter((p) => p.label === 0));

function splitStratum(items, trainRatio = 0.75) {
  const cut = Math.round(items.length * trainRatio);
  return { train: items.slice(0, cut), test: items.slice(cut) };
}

const posSplit = splitStratum(positives);
const negSplit = splitStratum(negatives);

const split = {
  train: shuffle([...posSplit.train, ...negSplit.train]),
  test: shuffle([...posSplit.test, ...negSplit.test]),
  evalOnly,
  meta: {
    seed: 20261120,
    trainRatio: 0.75,
    counts: {
      trainPositive: posSplit.train.length,
      trainNegative: negSplit.train.length,
      testPositive: posSplit.test.length,
      testNegative: negSplit.test.length,
      evalOnly: evalOnly.length,
    },
  },
};

writeFileSync(join(DATASET_DIR, "split.json"), JSON.stringify(split, null, 2));

console.log("Split composition:");
console.table(split.meta.counts);
console.log(`Train: ${split.train.length}, Test: ${split.test.length}, Eval-only: ${split.evalOnly.length}`);
