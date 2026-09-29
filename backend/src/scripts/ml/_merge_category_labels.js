// _merge_category_labels.js — one-off: merges the hand-assigned labels for the
// category pairs (laptops, TVs, smartwatches, tablets, headphones) into the
// labelled dataset and writes a 20-pair sample for independent spot-checking.
// Labels live in the LABELS array below, assigned from titles and prices alone
// against LABELING_RUBRIC.md, before any model output was consulted.
//
// Usage: node src/scripts/ml/_merge_category_labels.js <labels.json>
//   where labels.json is an array of [index, label, rationale].

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");

const raw = JSON.parse(readFileSync(join(DATASET_DIR, "category_pairs.raw.json"), "utf8"));
const labels = JSON.parse(readFileSync(process.argv[2], "utf8"));
const labeled = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.labeled.json"), "utf8"));

if (labels.length !== raw.length) throw new Error(`expected ${raw.length} labels, got ${labels.length}`);
labels.forEach(([i], n) => { if (i !== n) throw new Error(`label ${n} has index ${i}`); });

const already = new Set(labeled.map((p) => [p.idA, p.idB].sort().join("|")));
const added = raw.map((pair, i) => ({
  ...pair,
  label: labels[i][1],
  rationale: labels[i][2],
  reviewed: false,
  corrected: false,
}));
const fresh = added.filter((p) => !already.has([p.idA, p.idB].sort().join("|")));

writeFileSync(join(DATASET_DIR, "pairs.labeled.json"), JSON.stringify([...labeled, ...fresh], null, 2));

// Seeded sample for the human spot-check: 10 positives and 10 negatives.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(4242);
const sample = (items, n) => [...items].sort(() => rng() - 0.5).slice(0, n);
const check = [...sample(fresh.filter((p) => p.label === 1), 10), ...sample(fresh.filter((p) => p.label === 0), 10)];

writeFileSync(
  join(DATASET_DIR, "spot_check_category.json"),
  JSON.stringify(check.map((p, n) => ({
    n: n + 1, idA: p.idA, idB: p.idB, category: p.categoryA,
    titleA: p.titleA, priceA: p.priceA, titleB: p.titleB, priceB: p.priceB,
    myLabel: p.label, myRationale: p.rationale, yourLabel: null,
  })), null, 2)
);

console.log(`Added ${fresh.length} pairs (${fresh.filter((p) => p.label === 1).length} positive, ${fresh.filter((p) => p.label === 0).length} negative).`);
console.log(`Wrote spot_check_category.json with ${check.length} pairs.`);
