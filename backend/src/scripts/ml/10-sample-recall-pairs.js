// 10-sample-recall-pairs.js — grouping recall, step 1: how often does the live site leave the same product split in two?
//
// Merge precision (07, 08) says how often an offer placed under a product belongs there. It cannot see the opposite mistake: two
// stores' offers of one product shown as two products, so a shopper comparing prices never sees them side by side. That needs
// pairs the site did NOT put together, judged by a person.
//
// The unit is a pair of offers from two different stores in the same category. All such pairs are far too many, and nearly all
// are plainly different products, so the population is the CANDIDATE pairs: those whose titles share at least MIN_SIMILARITY of
// their model words (Jaccard over the normalised title without capacities and tier words, as the matcher's own rule compares).
// Pairs below that are almost never the same product; the report says this bounds what recall means here.
//
// The candidate pairs are split by what the production grouping did with them (the trained matcher, "ml", over every visible
// active listing of each category, as the catalogue groups them): TOGETHER (one product on the site) and APART. APART pairs
// outnumber TOGETHER ones about 35 to 1 (227,875 to 6,623 on 2026-10-26) and nearly all are different models with similar titles,
// so a plain random sample of them would put a few same-product pairs into a very wide interval. They are therefore split by
// title similarity into three strata, the most similar (where missed merges concentrate) sampled hardest; each stratum counts
// in the estimate by its real size, so the oversampling does not bias it. A fixed-seed random sample is drawn from every
// stratum, a person labels every pair "same" or "different" with LABELING_RUBRIC.md, and 11-score-recall.js estimates
//
//   correct merges   = TOGETHER pairs x share of its sample that are the same product
//   missed merges    = the sum over the APART strata of (pairs x share of its sample that are the same product)
//   recall           = correct / (correct + missed)
//
//   node src/scripts/ml/10-sample-recall-pairs.js            writes src/ml/dataset/group_recall.sample.json (--set=core)
//   node src/scripts/ml/10-sample-recall-pairs.js --seed=7   another sample

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { closeGroupingPool, groupListings } from "../../services/grouping.service.js";
import { modelTokens } from "../../services/normalizeTitle.service.js";
import { tokenize, VARIANT_TOKENS } from "../../services/similarity.service.js";
import { mergeSet } from "./mergeSets.js";

const SET = mergeSet();
const CATEGORIES = SET.categories;
export const MIN_SIMILARITY = 0.4;
// The strata and how many pairs each contributes to the sample.
export const STRATA = [
  { name: "together", test: (p) => p.together, n: 40 },
  { name: "apart_high", test: (p) => !p.together && p.similarity >= 0.8, n: 50 },
  { name: "apart_mid", test: (p) => !p.together && p.similarity >= 0.6 && p.similarity < 0.8, n: 40 },
  { name: "apart_low", test: (p) => !p.together && p.similarity < 0.6, n: 40 },
];
const seedArg = process.argv.find((a) => a.startsWith("--seed="));
const SEED = seedArg ? Number(seedArg.split("=")[1]) : SET.seed + 1;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml", "dataset", `${SET.file.replace("group_merges", "group_recall")}.sample.json`);

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

const modelWords = (title) => new Set(tokenize(modelTokens(title || "")).filter((word) => !VARIANT_TOKENS.has(word)));

function jaccard(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

const describe = (listing) => ({
  title: listing.title, platform: listing.platform, price: listing.price, storageGb: listing.storageGb ?? null, ramGb: listing.ramGb ?? null,
  colour: listing.colour ?? null, ptaStatus: listing.ptaStatus ?? "unknown", condition: listing.condition ?? "new", url: listing.productUrl || listing.sourceUrl || null,
});

/** Every candidate pair of a category (different stores, model-word similarity >= MIN_SIMILARITY), marked together or apart. */
function candidatePairs(groups, category) {
  const offers = [];
  groups.forEach((group, groupIndex) => {
    for (const offer of group.offers ?? []) offers.push({ offer, groupIndex, words: modelWords(offer.title) });
  });
  const byWord = new Map();
  offers.forEach((entry, index) => {
    for (const word of entry.words) {
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word).push(index);
    }
  });

  const pairs = [];
  offers.forEach((a, i) => {
    const seen = new Set();
    for (const word of a.words) {
      for (const j of byWord.get(word)) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        const b = offers[j];
        if (a.offer.platform === b.offer.platform) continue;
        const similarity = jaccard(a.words, b.words);
        if (similarity < MIN_SIMILARITY) continue;
        pairs.push({ category, together: a.groupIndex === b.groupIndex, similarity: Math.round(similarity * 100) / 100, a: a.offer, b: b.offer });
      }
    }
  });
  return pairs;
}

await mongoose.connect(process.env.MONGO_URI);
const rand = random(SEED);
const started = Date.now();
const pool = Object.fromEntries(STRATA.map((s) => [s.name, []]));
const population = {};

for (const category of CATEGORIES) {
  const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category }).lean();
  const groups = await groupListings(listings, { strategy: "ml", recommend: false, priority: "background", timeoutMs: 20 * 60 * 1000 });
  const pairs = candidatePairs(groups, category);
  population[category] = { listings: listings.length, groups: groups.length };
  for (const stratum of STRATA) {
    const inStratum = pairs.filter(stratum.test);
    pool[stratum.name].push(...inStratum);
    population[category][stratum.name] = inStratum.length;
  }
  console.log(`${category.padEnd(11)} ${String(listings.length).padStart(5)} listings, ${String(groups.length).padStart(5)} groups, candidate pairs: ` +
    STRATA.map((s) => `${s.name} ${population[category][s.name]}`).join(", "));
}

/** n pairs drawn at random from `list` (Fisher-Yates on a copy). */
function draw(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n);
}

const sample = STRATA.flatMap((s) => draw(pool[s.name], s.n).map((p) => ({ ...p, stratum: s.name })));
// Shuffled together, so the labeller cannot tell from the order which ones the site merged.
const pairs = draw(sample, sample.length).map((p, i) => ({
  id: `r${String(i + 1).padStart(3, "0")}`, category: p.category, stratum: p.stratum, similarity: p.similarity, a: describe(p.a), b: describe(p.b),
}));

writeFileSync(OUT, JSON.stringify({
  set: SET.name, drawnAt: new Date().toISOString(), seed: SEED, strategy: "ml", minSimilarity: MIN_SIMILARITY,
  strata: Object.fromEntries(STRATA.map((s) => [s.name, pool[s.name].length])),
  sampled: Object.fromEntries(STRATA.map((s) => [s.name, Math.min(s.n, pool[s.name].length)])), population, pairs,
}, null, 2));
console.log(`\ncandidate pairs by stratum: ${STRATA.map((s) => `${s.name} ${pool[s.name].length}`).join(", ")}; sampled ${pairs.length} ` +
  `in ${Math.round((Date.now() - started) / 1000)} s -> ${OUT}`);
await closeGroupingPool();
await mongoose.disconnect();
process.exit(0);
