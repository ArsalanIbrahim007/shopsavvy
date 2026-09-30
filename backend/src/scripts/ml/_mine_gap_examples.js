// _mine_gap_examples.js — targeted mining for three patterns the original
// random sample (01-mine-pairs.js) under-represented, found by running the
// trained model against the hand-crafted 18-case suite (src/scripts/checks/test-grouping-ml.js
// only scored 12/18 vs the rule's 18/18, concentrated in these patterns):
//   A) quote-mark screen size (65") vs the word "inch" (65 Inch), same TV
//   B) RAM+Storage stated on one side, Storage only on the other
//   C) bare title vs specific title with a SMALL price drift (<10%)
// One-off authoring script, not part of the numbered pipeline.
//
// Usage: node src/scripts/ml/_mine_gap_examples.js
// Output: src/ml/dataset/gap_pairs.raw.json

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { tokenize, calculateJaccardSimilarity, attributeConflict, VARIANT_TOKENS } from "../../services/similarity.service.js";
import { modelTokens, extractStorage } from "../../services/normalizeTitle.service.js";
import { extractRamGb } from "../../services/productAttributes.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "..", "ml", "dataset", "gap_pairs.raw.json");

function baseTokensFor(title) {
  return tokenize(modelTokens(title)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");
}

await mongoose.connect(process.env.MONGO_URI);
const collection = mongoose.connection.db.collection("listings");

const all = await collection
  .find({ title: { $exists: true, $ne: "" } })
  .project({ title: 1, platform: 1, price: 1, productCategory: 1 })
  .toArray();

const byCategory = new Map();
for (const l of all) {
  if (!byCategory.has(l.productCategory)) byCategory.set(l.productCategory, []);
  byCategory.get(l.productCategory).push(l);
}

const found = [];

function addIfNotVetoed(a, b, pool) {
  if (attributeConflict(a.title, b.title, { ignoreUnstatedStorage: true })) return;
  const jaccardBase = calculateJaccardSimilarity(baseTokensFor(a.title), baseTokensFor(b.title));
  if (jaccardBase < 0.3) return; // not even textually close, not a useful example either way
  found.push({
    idA: String(a._id), idB: String(b._id),
    titleA: a.title, titleB: b.title,
    platformA: a.platform, platformB: b.platform,
    priceA: a.price ?? null, priceB: b.price ?? null,
    categoryA: a.productCategory, categoryB: b.productCategory,
    pool, jaccardBase: Number(jaccardBase.toFixed(4)),
  });
}

// Pattern A: quote-mark vs "inch" word, same tv model
const tvs = byCategory.get("tv") || [];
const quoteTvs = tvs.filter((l) => /\d\s*"/.test(l.title));
const inchTvs = tvs.filter((l) => /\d\s*inch/i.test(l.title));
for (const a of quoteTvs) {
  for (const b of inchTvs) {
    if (a._id.equals(b._id)) continue;
    addIfNotVetoed(a, b, "gap_quote_vs_inch");
  }
}

// Pattern B: RAM+Storage stated vs Storage-only, within category
for (const [, items] of byCategory) {
  const withRam = items.filter((l) => extractRamGb(l.title) !== null && extractStorage(l.title) !== null);
  const storageOnly = items.filter((l) => extractRamGb(l.title) === null && extractStorage(l.title) !== null);
  for (const a of withRam) {
    for (const b of storageOnly) {
      if (a._id.equals(b._id)) continue;
      if (extractStorage(a.title) !== extractStorage(b.title)) continue; // only same-storage candidates are useful here
      addIfNotVetoed(a, b, "gap_ram_stated_once");
    }
  }
}

// Pattern C: bare title vs specific title, small price drift (<10%), any category
for (const [, items] of byCategory) {
  const bare = items.filter((l) => extractStorage(l.title) === null && extractRamGb(l.title) === null);
  const specific = items.filter((l) => extractStorage(l.title) !== null);
  for (const a of bare) {
    for (const b of specific) {
      if (a._id.equals(b._id)) continue;
      if (!a.price || !b.price) continue;
      const drift = Math.abs(a.price - b.price) / ((a.price + b.price) / 2);
      if (drift >= 0.10) continue;
      addIfNotVetoed(a, b, "gap_bare_small_drift");
    }
  }
}

console.log("Found candidates by pattern:");
const counts = {};
found.forEach((p) => { counts[p.pool] = (counts[p.pool] || 0) + 1; });
console.table(counts);

// Cap each pattern to a manageable, still-real sample.
const CAP = 15;
const byPool = {};
found.forEach((p) => { (byPool[p.pool] = byPool[p.pool] || []).push(p); });
const sampled = Object.values(byPool).flatMap((items) => items.slice(0, CAP));

writeFileSync(OUT_FILE, JSON.stringify(sampled, null, 2));
console.log(`\nSampled ${sampled.length} pairs (capped at ${CAP} per pattern). Wrote ${OUT_FILE}`);

await mongoose.disconnect();
