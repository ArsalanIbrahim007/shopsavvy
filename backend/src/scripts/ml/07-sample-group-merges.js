// 07-sample-group-merges.js — B9, grouping-level evaluation, step 1: draw a random sample of the merges the live site makes, for a
// person to judge.
//
// Pair-level scores (EVALUATION_REPORT.md) do not tell how the grouping a shopper sees behaves, so this measures that directly. The
// unit is an offer placed under a product: in every product group of two or more offers, each offer other than the group's main
// one (the listing whose title names the group) is a "merge". The sample is 100 of them, drawn at random with a fixed seed so it can
// be drawn again identically, spread over the six deal categories in proportion to how many merges each has, with at least 8 from
// each. The grouping is the production one: the trained matcher ("ml", the search default), over every visible active listing of a
// category, the way the catalogue groups them.
//
// A person then marks each merge "same product" or "different" (colour may differ; model, storage/RAM variant and condition may not),
// and 08-score-group-merges.js turns the marks into merge precision with a confidence interval.
//
//   node src/scripts/ml/07-sample-group-merges.js            writes src/ml/dataset/group_merges.sample.json
//   node src/scripts/ml/07-sample-group-merges.js --seed=7   another sample

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { closeGroupingPool, groupListings } from "../../services/grouping.service.js";
import { mergeSet } from "./mergeSets.js";

// --set=core (the B9 sample, the default) or --set=appliances: see mergeSets.js.
const SET = mergeSet();
const SAMPLE_SIZE = SET.size;
const MIN_PER_CATEGORY = SET.minPerCategory;
const CATEGORIES = SET.categories;
const seedArg = process.argv.find((a) => a.startsWith("--seed="));
const SEED = seedArg ? Number(seedArg.split("=")[1]) : SET.seed;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml", "dataset", `${SET.file}.sample.json`);

/** mulberry32: a small seeded random number generator, so the same seed draws the same sample. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const describe = (listing) => ({
  title: listing.title, platform: listing.platform, price: listing.price, storageGb: listing.storageGb ?? null, ramGb: listing.ramGb ?? null,
  colour: listing.colour ?? null, ptaStatus: listing.ptaStatus ?? "unknown", condition: listing.condition ?? "new", url: listing.productUrl || listing.sourceUrl || null,
});

await mongoose.connect(process.env.MONGO_URI);
const rand = random(SEED);
const population = {}; // category -> merges
const started = Date.now();

for (const category of CATEGORIES) {
  const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category }).lean();
  const groups = await groupListings(listings, { strategy: "ml", recommend: false, priority: "background", timeoutMs: 20 * 60 * 1000 });
  const merges = [];
  for (const group of groups) {
    if ((group.offers?.length ?? 0) < 2) continue;
    const main = group.offers.find((offer) => offer.title === group.productName) ?? group.offers[0];
    for (const offer of group.offers) {
      if (offer === main) continue;
      merges.push({ category, groupName: group.productName, groupSize: group.offers.length, main: describe(main), offer: describe(offer) });
    }
  }
  population[category] = merges;
  console.log(`${category.padEnd(11)} ${String(listings.length).padStart(5)} listings, ${String(groups.length).padStart(5)} groups, ${String(merges.length).padStart(5)} merges`);
}

// Proportional allocation with a floor, then trimmed or topped up (largest categories first) to exactly SAMPLE_SIZE.
const total = Object.values(population).reduce((n, merges) => n + merges.length, 0);
const quota = Object.fromEntries(Object.entries(population).map(([c, m]) => [c, Math.min(m.length, Math.max(MIN_PER_CATEGORY, Math.round((SAMPLE_SIZE * m.length) / total)))]));
const bySize = Object.keys(quota).sort((a, b) => population[b].length - population[a].length);
let sum = Object.values(quota).reduce((n, q) => n + q, 0);
for (let i = 0; sum !== SAMPLE_SIZE && i < 1000; i++) {
  const c = bySize[i % bySize.length];
  if (sum > SAMPLE_SIZE && quota[c] > Math.min(MIN_PER_CATEGORY, population[c].length)) { quota[c] -= 1; sum -= 1; }
  else if (sum < SAMPLE_SIZE && quota[c] < population[c].length) { quota[c] += 1; sum += 1; }
}

const sample = [];
for (const category of CATEGORIES) {
  const pool = [...population[category]];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } // Fisher-Yates
  sample.push(...pool.slice(0, quota[category]));
}
sample.forEach((merge, i) => { merge.id = `m${String(i + 1).padStart(3, "0")}`; });

writeFileSync(OUT, JSON.stringify({
  set: SET.name, drawnAt: new Date().toISOString(), seed: SEED, strategy: "ml", sampleSize: sample.length,
  population: Object.fromEntries(Object.entries(population).map(([c, m]) => [c, m.length])), quota, merges: sample,
}, null, 2));
console.log(`\n${total} merges in all; sampled ${sample.length} (${Object.entries(quota).map(([c, q]) => `${c} ${q}`).join(", ")}) in ${Math.round((Date.now() - started) / 1000)} s -> ${OUT}`);
await closeGroupingPool();
await mongoose.disconnect();
process.exit(0);
