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
// The split is grouped (shared listing or product family) and stratified by category.
// A first version shuffled pairs individually, so several pairs about one product
// could land on both sides and the held-out score partly measured memorised
// titles. Whole groups now go to one side only, and each category contributes
// about a quarter of its pairs to the test set, so laptops, TVs and watches are
// all tested rather than being swamped by phones.
//
// Usage: node src/scripts/ml/03-split-dataset.js
// Output: src/ml/dataset/split.json

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { pairComponents } from "../../ml/dataset/family.js";

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

const CATEGORY_POOL = /^cat_/;
const TRAINABLE_POOLS = new Set([
  "positive", "hard_negative_ambiguous", "easy_negative_same_category",
  // Targeted follow-up mining (_mine_gap_examples.js) for patterns the
  // random sample under-represented: quote-mark vs "inch" formatting,
  // RAM-stated-once, and bare-vs-specific with a small price drift.
  "gap_quote_vs_inch", "gap_ram_stated_once", "gap_bare_small_drift",
]);

const labeled = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.labeled.json"), "utf8"));

const isTrainable = (p) => TRAINABLE_POOLS.has(p.pool) || CATEGORY_POOL.test(p.pool);
const trainable = labeled.filter(isTrainable);
const evalOnly = labeled.filter((p) => !isTrainable(p));

const TEST_RATIO = 0.25;

const byCategory = new Map();
for (const pair of trainable) {
  const category = pair.categoryA || "other";
  if (!byCategory.has(category)) byCategory.set(category, []);
  byCategory.get(category).push(pair);
}

const train = [];
const test = [];

for (const [, pairs] of [...byCategory].sort()) {
  const testTarget = Math.round(pairs.length * TEST_RATIO);
  const trainTarget = pairs.length - testTarget;
  let testCount = 0;
  let trainCount = 0;

  // Largest groups first, each to whichever side is further below its target,
  // so one big connected group cannot push a side far past its share.
  const groups = shuffle(pairComponents(pairs)).sort((x, y) => y[1].length - x[1].length);
  for (const [, members] of groups) {
    if (testTarget - testCount > trainTarget - trainCount) { test.push(...members); testCount += members.length; }
    else { train.push(...members); trainCount += members.length; }
  }
}

const count = (arr, label) => arr.filter((p) => p.label === label).length;

const split = {
  train: shuffle(train),
  test: shuffle(test),
  evalOnly,
  meta: {
    seed: 20261120,
    testRatio: TEST_RATIO,
    grouping: "connected components of shared listings and product families, stratified by category",
    counts: {
      trainPositive: count(train, 1),
      trainNegative: count(train, 0),
      testPositive: count(test, 1),
      testNegative: count(test, 0),
      evalOnly: evalOnly.length,
    },
    testByCategory: Object.fromEntries(
      [...byCategory.keys()].sort().map((c) => {
        const inTest = test.filter((p) => (p.categoryA || "other") === c);
        return [c, { positive: count(inTest, 1), negative: count(inTest, 0) }];
      })
    ),
  },
};

writeFileSync(join(DATASET_DIR, "split.json"), JSON.stringify(split, null, 2));

console.log("Split composition:");
console.table(split.meta.counts);
console.log(`Train: ${split.train.length}, Test: ${split.test.length}, Eval-only: ${split.evalOnly.length}`);
