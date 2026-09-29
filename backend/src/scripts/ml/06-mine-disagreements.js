// 06-mine-disagreements.js — third mining pass: the pairs where two models
// disagree about the live catalogue.
//
// Pair-level test scores did not predict system-level behaviour: a retrained
// candidate scored well on held-out pairs yet merged far too eagerly when the
// whole database was regrouped. The merges it makes that the production model
// does not are exactly the cases the training data was missing, so they are
// turned into labelled pairs here (some will be genuine same-product pairs the
// production model misses, others wrong merges: both are informative).
//
// Both models group the whole database with the same code; a "disagreement"
// is a group formed by the candidate that combines several groups the
// production model kept apart. One pair is emitted per pair of parts, using the
// cheapest listing of each part, capped per group.
//
// Usage: node src/scripts/ml/06-mine-disagreements.js
// Output: src/ml/dataset/disagreement_pairs.raw.json

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";
import { attributeConflict } from "../../services/similarity.service.js";
import { DISABLED_PLATFORMS } from "../../config/platforms.js";
import { familyKey } from "../../ml/dataset/family.js";
import { predictProba } from "../../ml/logisticRegression.js";
import { buildFeatureVector } from "../../ml/features.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ML_DIR = join(__dirname, "..", "..", "ml");
const DATASET_DIR = join(ML_DIR, "dataset");

const candidate = JSON.parse(readFileSync(join(ML_DIR, "model.artifact.v2-multicategory.json"), "utf8"));
const MAX_PAIRS_PER_GROUP = 4;

const existing = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.labeled.json"), "utf8"));
const seen = new Set(existing.map((p) => [p.idA, p.idB].sort().join("|")));

await mongoose.connect(process.env.MONGO_URI);
const listings = (await mongoose.connection.db.collection("listings").find({ platform: { $nin: DISABLED_PLATFORMS } }).toArray())
  .sort((a, b) => String(a._id).localeCompare(String(b._id)));
await mongoose.disconnect();

const byCategory = new Map();
for (const l of listings) {
  const c = l.productCategory || "other";
  if (!byCategory.has(c)) byCategory.set(c, []);
  byCategory.get(c).push(l);
}

// The candidate's grouping strategy: same matcher, candidate weights.
function candidateStrategy(rawTitle, group, listing) {
  const price = group.lowestPrice != null && group.highestPrice != null ? (group.lowestPrice + group.highestPrice) / 2 : null;
  const p = (title, priceB) => {
    if (attributeConflict(rawTitle, title, { ignoreUnstatedStorage: true })) return false;
    const f = buildFeatureVector({ titleA: rawTitle, titleB: title, priceA: listing.price ?? null, priceB });
    return predictProba(f, candidate) >= candidate.threshold;
  };
  return p(group.rawGroupKey, price);
}

const out = [];
for (const [category, items] of byCategory) {
  const production = groupListingsByProduct(items, { matchStrategy: mlMatchStrategy });
  const productionGroupOf = new Map();
  production.forEach((g, i) => g.offers.forEach((o) => productionGroupOf.set(String(o._id), i)));

  const cand = groupListingsByProduct(items, { matchStrategy: candidateStrategy });
  for (const g of cand) {
    const parts = new Map();
    for (const o of g.offers) {
      const k = productionGroupOf.get(String(o._id));
      if (!parts.has(k)) parts.set(k, []);
      parts.get(k).push(o);
    }
    if (parts.size < 2) continue;

    const reps = [...parts.values()].map((p) => [...p].sort((a, b) => a.price - b.price)[0]);
    let taken = 0;
    for (let i = 0; i < reps.length && taken < MAX_PAIRS_PER_GROUP; i++) {
      for (let j = i + 1; j < reps.length && taken < MAX_PAIRS_PER_GROUP; j++) {
        const a = reps[i];
        const b = reps[j];
        const key = [String(a._id), String(b._id)].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          idA: String(a._id), idB: String(b._id),
          titleA: a.title, titleB: b.title,
          platformA: a.platform, platformB: b.platform,
          priceA: a.price ?? null, priceB: b.price ?? null,
          categoryA: a.productCategory || "other", categoryB: b.productCategory || "other",
          pool: "cat_disagreement",
          family: familyKey(a.title),
        });
        taken++;
      }
    }
  }
}

writeFileSync(join(DATASET_DIR, "disagreement_pairs.raw.json"), JSON.stringify(out, null, 2));
const counts = {};
out.forEach((p) => { counts[p.categoryA] = (counts[p.categoryA] || 0) + 1; });
console.log(`Wrote ${out.length} disagreement pairs`, counts);
