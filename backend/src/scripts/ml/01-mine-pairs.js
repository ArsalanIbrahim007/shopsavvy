// 01-mine-pairs.js — mines candidate title pairs from the live listings
// collection for the trained matching classifier's dataset.
//
// Blocks by productCategory (never compares all 822^2 pairs), buckets every
// within-category pair by how the existing rule engine treats it, then
// reservoir-samples a fixed target count from each bucket so the mined set
// is reproducible (seeded RNG) and not dominated by any one category.
//
// Usage: node src/scripts/ml/01-mine-pairs.js
// Output: src/ml/dataset/pairs.raw.json (unlabeled — see 02 for labeling)

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { tokenize, calculateJaccardSimilarity, attributeConflict, VARIANT_TOKENS } from "../../services/similarity.service.js";
import { modelTokens } from "../../services/normalizeTitle.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "ml", "dataset");
const OUT_FILE = join(OUT_DIR, "pairs.raw.json");

const TARGETS = {
  positive: 50,
  hard_negative_ambiguous: 45,
  easy_negative_same_category: 15,
  hard_negative_veto: 30,
  easy_negative_cross_category: 10,
};

// Seeded PRNG (mulberry32) so the mined sample is reproducible run to run.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261120); // seeded on the defense date, arbitrary but fixed

function baseTokensFor(title) {
  return tokenize(modelTokens(title)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");
}

function reservoirSample(items, k, rand) {
  const sample = items.slice(0, k);
  for (let i = k; i < items.length; i++) {
    const j = Math.floor(rand() * (i + 1));
    if (j < k) sample[j] = items[i];
  }
  return sample;
}

await mongoose.connect(process.env.MONGO_URI);
const collection = mongoose.connection.db.collection("listings");

const listings = await collection
  .find({ title: { $exists: true, $ne: "" }, productCategory: { $exists: true, $ne: null } })
  .project({ title: 1, platform: 1, price: 1, productCategory: 1 })
  .toArray();

console.log(`Loaded ${listings.length} listings.`);

const byCategory = new Map();
for (const listing of listings) {
  const cat = listing.productCategory;
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(listing);
}

const buckets = {
  positive: [],
  hard_negative_ambiguous: [],
  easy_negative_same_category: [],
  hard_negative_veto: [],
};

function makePairRecord(a, b, pool, jaccardBase) {
  return {
    idA: String(a._id),
    idB: String(b._id),
    titleA: a.title,
    titleB: b.title,
    platformA: a.platform,
    platformB: b.platform,
    priceA: a.price ?? null,
    priceB: b.price ?? null,
    categoryA: a.productCategory,
    categoryB: b.productCategory,
    pool,
    jaccardBase: Number(jaccardBase.toFixed(4)),
  };
}

for (const [category, items] of byCategory) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];

      const jaccardBase = calculateJaccardSimilarity(baseTokensFor(a.title), baseTokensFor(b.title));
      const vetoLenient = attributeConflict(a.title, b.title, { ignoreUnstatedStorage: true });

      if (vetoLenient) {
        buckets.hard_negative_veto.push(makePairRecord(a, b, "hard_negative_veto", jaccardBase));
        continue;
      }

      const crossPlatform = a.platform !== b.platform;

      if (crossPlatform && jaccardBase >= 0.5) {
        buckets.positive.push(makePairRecord(a, b, "positive", jaccardBase));
      } else if (jaccardBase >= 0.15 && jaccardBase < 0.6) {
        buckets.hard_negative_ambiguous.push(makePairRecord(a, b, "hard_negative_ambiguous", jaccardBase));
      } else if (jaccardBase < 0.15) {
        buckets.easy_negative_same_category.push(makePairRecord(a, b, "easy_negative_same_category", jaccardBase));
      }
    }
  }
}

console.log("\nCandidate pool sizes before sampling:");
for (const [pool, items] of Object.entries(buckets)) {
  console.log(`  ${pool.padEnd(28)} ${items.length}`);
}

const mined = [];
for (const [pool, target] of Object.entries(TARGETS)) {
  if (pool === "easy_negative_cross_category") continue;
  const sampled = reservoirSample(buckets[pool], Math.min(target, buckets[pool].length), rng);
  mined.push(...sampled);
  if (sampled.length < target) {
    console.warn(`  WARNING: only ${sampled.length}/${target} available for pool "${pool}"`);
  }
}

// Cross-category easy negatives: random pairs from different categories.
const categories = [...byCategory.keys()];
const crossPairs = [];
let attempts = 0;
while (crossPairs.length < TARGETS.easy_negative_cross_category && attempts < 5000) {
  attempts++;
  const catA = categories[Math.floor(rng() * categories.length)];
  const catB = categories[Math.floor(rng() * categories.length)];
  if (catA === catB) continue;
  const itemsA = byCategory.get(catA);
  const itemsB = byCategory.get(catB);
  const a = itemsA[Math.floor(rng() * itemsA.length)];
  const b = itemsB[Math.floor(rng() * itemsB.length)];
  const jaccardBase = calculateJaccardSimilarity(baseTokensFor(a.title), baseTokensFor(b.title));
  crossPairs.push(makePairRecord(a, b, "easy_negative_cross_category", jaccardBase));
}
mined.push(...crossPairs);

console.log(`\nMined ${mined.length} total pairs.`);
console.log("Composition:");
const counts = {};
mined.forEach((p) => { counts[p.pool] = (counts[p.pool] || 0) + 1; });
console.table(counts);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(mined, null, 2));
console.log(`\nWrote ${OUT_FILE}`);

await mongoose.disconnect();
