// 02-mine-category-pairs.js — second mining pass, for the categories the first
// dataset barely covered. The original 181 pairs are 60% smartphones; laptops
// had no positive pairs, smartwatches none, and TVs six, so the trained
// classifier had effectively never been tested outside phones.
//
// Candidates are cross-platform pairs inside one category that survive the
// attribute veto (the same lenient veto the classifier runs behind), because
// those are the only pairs the model is ever asked about. Pairs are drawn in
// two textual-similarity bands so the sample contains both easy and hard
// cases, capped per product family and per listing so a handful of popular
// models cannot dominate.
//
// Labels are NOT suggested here: they are assigned separately by hand against
// the rubric in LABELING_RUBRIC.md, before any model output is looked at.
//
// Usage: node src/scripts/ml/02-mine-category-pairs.js
// Output: src/ml/dataset/category_pairs.raw.json

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { tokenize, calculateJaccardSimilarity, attributeConflict, VARIANT_TOKENS } from "../../services/similarity.service.js";
import { modelTokens } from "../../services/normalizeTitle.service.js";
import { DISABLED_PLATFORMS } from "../../config/platforms.js";
import { familyKey } from "../../ml/dataset/family.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");

// Deterministic sampling so the mined set can be regenerated.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260929);
const shuffle = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const QUOTAS = { laptop: 45, tv: 45, smartwatch: 30, tablet: 15, headphones: 15, monitor: 10 };
const HIGH_BAND = 0.6; // jaccardBase at or above: "looks like the same product"
const LOW_BAND = 0.35; // below this the titles share too little to be informative
const MAX_PER_FAMILY = 3;
const MAX_PER_LISTING = 2;

const baseTokens = (title) =>
  tokenize(modelTokens(title)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");

const existing = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.labeled.json"), "utf8"));
const seenPairs = new Set(existing.map((p) => [p.idA, p.idB].sort().join("|")));

await mongoose.connect(process.env.MONGO_URI);
const all = await mongoose.connection.db
  .collection("listings")
  .find({
    title: { $exists: true, $ne: "" },
    platform: { $nin: DISABLED_PLATFORMS },
    productCategory: { $in: Object.keys(QUOTAS) },
  })
  .project({ title: 1, platform: 1, price: 1, productCategory: 1 })
  .toArray();
await mongoose.disconnect();

const byCategory = new Map();
for (const l of all) {
  if (!byCategory.has(l.productCategory)) byCategory.set(l.productCategory, []);
  byCategory.get(l.productCategory).push(l);
}

const picked = [];

for (const [category, quota] of Object.entries(QUOTAS)) {
  const items = byCategory.get(category) || [];
  const high = [];
  const mid = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.platform === b.platform) continue;
      if (seenPairs.has([String(a._id), String(b._id)].sort().join("|"))) continue;
      if (attributeConflict(a.title, b.title, { ignoreUnstatedStorage: true })) continue;

      const jaccardBase = calculateJaccardSimilarity(baseTokens(a.title), baseTokens(b.title));
      if (jaccardBase < LOW_BAND) continue;

      const pair = { a, b, jaccardBase };
      (jaccardBase >= HIGH_BAND ? high : mid).push(pair);
    }
  }

  const familyCount = new Map();
  const listingCount = new Map();
  const chosen = [];

  const take = (pool, n) => {
    for (const pair of shuffle(pool)) {
      if (n <= 0) break;
      const family = familyKey(pair.a.title);
      const ida = String(pair.a._id);
      const idb = String(pair.b._id);
      if ((familyCount.get(family) || 0) >= MAX_PER_FAMILY) continue;
      if ((listingCount.get(ida) || 0) >= MAX_PER_LISTING) continue;
      if ((listingCount.get(idb) || 0) >= MAX_PER_LISTING) continue;
      familyCount.set(family, (familyCount.get(family) || 0) + 1);
      listingCount.set(ida, (listingCount.get(ida) || 0) + 1);
      listingCount.set(idb, (listingCount.get(idb) || 0) + 1);
      chosen.push(pair);
      n--;
    }
  };

  const half = Math.ceil(quota / 2);
  take(high, half);
  take(mid, quota - chosen.length);
  take(high, quota - chosen.length); // top up from the other band if one ran short

  console.log(`${category}: ${chosen.length}/${quota} (candidates: ${high.length} high band, ${mid.length} mid band)`);

  for (const { a, b, jaccardBase } of chosen) {
    picked.push({
      idA: String(a._id), idB: String(b._id),
      titleA: a.title, titleB: b.title,
      platformA: a.platform, platformB: b.platform,
      priceA: a.price ?? null, priceB: b.price ?? null,
      categoryA: a.productCategory, categoryB: b.productCategory,
      pool: `cat_${category}`,
      family: familyKey(a.title),
      jaccardBase: Number(jaccardBase.toFixed(4)),
    });
  }
}

writeFileSync(join(DATASET_DIR, "category_pairs.raw.json"), JSON.stringify(picked, null, 2));
console.log(`\nWrote ${picked.length} candidate pairs to category_pairs.raw.json`);
