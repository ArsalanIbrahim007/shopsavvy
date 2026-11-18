// 13-mine-labelling-pairs.js — draws a fresh set of about 300 cross-store pairs for people to label (labelling round of 2026-11-18),
// a sealed test set of about 100 of them, and 60 pairs that two people label independently (Cohen's kappa).
//
//   node src/scripts/ml/13-mine-labelling-pairs.js ["<folder for the labelling sheets>"]     default: ..\..\labelling (outside the repo)
//
// Writes src/ml/dataset/pairs_nov18.raw.json (every pair, unlabelled, with its sheet assignment and whether it is sealed) and one CSV
// sheet per labeller plus INSTRUCTIONS.md in the sheet folder. Reproducible: seeded, and it reads only the database.
//
// Chosen WITHOUT the matcher, so the sample does not favour what the system already gets right: within one category, two listings
// from different stores, with the same brand, sharing at least one word that holds a digit (a model number), are a candidate. Each
// category's candidates are split by how many plain words the titles share (Jaccard of the titles without store wording: low 0.25 to
// 0.5, mid 0.5 to 0.75, high 0.75 and up) and drawn evenly from the three, so the sheets hold both easy and hard pairs of both kinds.
// No listing that appears in any earlier labelled pair (pairs.labeled.json) is used, so the sealed set shares nothing with the data
// the models were trained on; a listing appears in at most two new pairs.

import { config } from "dotenv";
config({ quiet: true });
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { modelTokens } from "../../services/normalizeTitle.service.js";
import { extractBrand } from "../../services/productAttributes.service.js";
import { tokenize } from "../../services/similarity.service.js";
import { withoutStoreWording } from "../../services/similarityModel.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATASET = join(here, "..", "..", "ml", "dataset");
const OUT_FILE = join(DATASET, "pairs_nov18.raw.json");
const SHEETS = resolve(process.argv[2] || join(here, "..", "..", "..", "..", "..", "labelling"));
const SEED = 20261118;

// From labelling-plan.md: the weakest categories get the most.
export const TARGETS = {
  smartphone: 70, tv: 10, laptop: 15, smartwatch: 10, tablet: 20, headphones: 25, accessory: 20,
  air_conditioner: 30, refrigerator: 30, washing_machine: 30, monitor: 30, other: 10,
};
const SEALED_SHARE = 1 / 3; // about 100 of 300
const OVERLAP = 60; // pairs a second person also labels
const LABELLERS = ["Arsalan", "Muzammil", "Abuzar"];
// Each of these stores in at least 5 pairs (they had none in the earlier labelled set).
export const STORES_TO_COVER = ["mistore", "mymart", "alfatah", "xcessorieshub", "eezepc", "alfamall", "digimall", "jalalelectronics", "japanelectronics", "audionic"];
const MIN_PER_STORE = 5;
const BANDS = [["low", 0.25, 0.5], ["mid", 0.5, 0.75], ["high", 0.75, 1.01]];
const MAX_PRICE_RATIO = 3;
const MAX_PAIRS_PER_BLOCK = 300;
const MAX_USES_PER_LISTING = 2;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const plainTokens = (title) => new Set(tokenize(modelTokens(withoutStoreWording(title))));
export function jaccard(a, b) {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}
export const bandOf = (j) => BANDS.find(([, lo, hi]) => j >= lo && j < hi)?.[0] ?? null;

/** Candidate pairs of one category (see the header), each with its Jaccard band. */
export function candidatePairs(listings, rng) {
  const items = listings.map((l) => ({ l, brand: extractBrand(l.title, l.brand), tokens: plainTokens(l.title) }))
    .filter((x) => x.brand && x.tokens.size > 0);
  const blocks = new Map();
  for (const x of items) {
    for (const token of x.tokens) {
      if (!/\d/.test(token)) continue;
      const key = `${x.brand}|${token}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(x);
    }
  }
  const seen = new Set();
  const out = [];
  for (const members of blocks.values()) {
    if (members.length < 2) continue;
    const all = [];
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) all.push([members[i], members[j]]);
    // a large block (a brand's "1.5 ton" air conditioners) is sampled, not taken whole
    for (let k = all.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [all[k], all[r]] = [all[r], all[k]]; }
    for (const [a, b] of all.slice(0, MAX_PAIRS_PER_BLOCK)) {
      if (a.l.platform === b.l.platform) continue;
      const key = [String(a.l._id), String(b.l._id)].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = Math.max(a.l.price, b.l.price) / Math.min(a.l.price, b.l.price);
      if (ratio > MAX_PRICE_RATIO) continue;
      const j = jaccard(a.tokens, b.tokens);
      const band = bandOf(j);
      if (band) out.push({ a: a.l, b: b.l, jaccard: Number(j.toFixed(3)), band });
    }
  }
  return out;
}

function toPair(c, category) {
  const [a, b] = String(c.a._id) < String(c.b._id) ? [c.a, c.b] : [c.b, c.a];
  return {
    idA: String(a._id), idB: String(b._id), titleA: a.title, titleB: b.title, platformA: a.platform, platformB: b.platform,
    priceA: a.price, priceB: b.price, urlA: a.productUrl || a.sourceUrl, urlB: b.productUrl || b.sourceUrl,
    categoryA: category, categoryB: category, pool: `nov18_${category}`, band: c.band, jaccardPlain: c.jaccard,
  };
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  const rng = mulberry32(SEED);
  const earlier = JSON.parse(readFileSync(join(DATASET, "pairs.labeled.json"), "utf8"));
  const used = new Set(earlier.flatMap((p) => [p.idA, p.idB]));

  await mongoose.connect(process.env.MONGO_URI);
  const uses = new Map();
  const canUse = (c) => (uses.get(String(c.a._id)) ?? 0) < MAX_USES_PER_LISTING && (uses.get(String(c.b._id)) ?? 0) < MAX_USES_PER_LISTING;
  const take = (c) => { for (const l of [c.a, c.b]) uses.set(String(l._id), (uses.get(String(l._id)) ?? 0) + 1); };
  const chosen = [];
  const pools = {};
  for (const category of Object.keys(TARGETS)) {
    const listings = (await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category, price: { $gt: 0 } })
      .select("title price platform brand productUrl sourceUrl").lean()).filter((l) => !used.has(String(l._id)));
    pools[category] = candidatePairs(listings, rng);
    const byBand = Object.fromEntries(BANDS.map(([b]) => [b, pools[category].filter((c) => c.band === b)]));
    console.log(`${category}: ${listings.length} listings, ${pools[category].length} candidates (${BANDS.map(([b]) => `${b} ${byBand[b].length}`).join(", ")})`);
  }

  // Store coverage first: up to MIN_PER_STORE pairs for each store that had none, spread over its categories and bands.
  const count = (category) => chosen.filter((p) => p.categoryA === category).length;
  for (const store of STORES_TO_COVER) {
    const options = Object.entries(pools).flatMap(([category, list]) => list.filter((c) => c.a.platform === store || c.b.platform === store).map((c) => ({ c, category })));
    for (let k = options.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [options[k], options[r]] = [options[r], options[k]]; }
    let got = chosen.filter((p) => p.platformA === store || p.platformB === store).length;
    for (const { c, category } of options) {
      if (got >= MIN_PER_STORE) break;
      if (count(category) >= TARGETS[category] || !canUse(c)) continue;
      take(c); chosen.push(toPair(c, category)); got += 1;
      pools[category] = pools[category].filter((x) => x !== c);
    }
  }

  // Then each category up to its target, the three bands in turn.
  for (const [category, target] of Object.entries(TARGETS)) {
    const byBand = Object.fromEntries(BANDS.map(([b]) => {
      const list = pools[category].filter((c) => c.band === b);
      for (let k = list.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [list[k], list[r]] = [list[r], list[k]]; }
      return [b, list];
    }));
    let progress = true;
    while (count(category) < target && progress) {
      progress = false;
      for (const [b] of BANDS) {
        if (count(category) >= target) break;
        const list = byBand[b];
        while (list.length && !canUse(list[0])) list.shift();
        const c = list.shift();
        if (!c) continue;
        take(c); chosen.push(toPair(c, category)); progress = true;
      }
    }
  }
  await mongoose.disconnect();

  // Shuffle, number, seal a third of each category, assign labellers.
  for (let k = chosen.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [chosen[k], chosen[r]] = [chosen[r], chosen[k]]; }
  chosen.forEach((p, i) => { p.pairId = `N${String(i + 1).padStart(3, "0")}`; });
  for (const category of Object.keys(TARGETS)) {
    const list = chosen.filter((p) => p.categoryA === category);
    list.forEach((p, i) => { p.sealed = i < Math.round(list.length * SEALED_SHARE); });
  }
  chosen.forEach((p, i) => { p.labellers = [LABELLERS[i % LABELLERS.length]]; });
  // OVERLAP pairs get a second labeller: the next person round, so each pair of people shares OVERLAP / 3.
  for (let i = 0; i < OVERLAP && i < chosen.length; i++) chosen[i].labellers.push(LABELLERS[(i + 1) % LABELLERS.length]);

  writeFileSync(OUT_FILE, JSON.stringify({
    createdAt: new Date().toISOString(), seed: SEED, method: "see header of src/scripts/ml/13-mine-labelling-pairs.js",
    counts: { pairs: chosen.length, sealed: chosen.filter((p) => p.sealed).length, doubleLabelled: chosen.filter((p) => p.labellers.length === 2).length },
    pairs: chosen,
  }, null, 1));

  mkdirSync(SHEETS, { recursive: true });
  const header = ["pair_id", "category", "store_A", "title_A", "price_A", "link_A", "store_B", "title_B", "price_B", "link_B", "label (same / different / unsure)", "note"];
  for (const person of LABELLERS) {
    const rows = chosen.filter((p) => p.labellers.includes(person)).sort((x, y) => x.pairId.localeCompare(y.pairId))
      .map((p) => [p.pairId, p.categoryA, p.platformA, p.titleA, p.priceA, p.urlA, p.platformB, p.titleB, p.priceB, p.urlB, "", ""]);
    writeFileSync(join(SHEETS, `sheet-${person}.csv`), "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n");
    console.log(`sheet-${person}.csv: ${rows.length} pairs`);
  }

  const tally = (key) => Object.entries(chosen.reduce((m, p) => ((m[p[key]] = (m[p[key]] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(", ");
  const storeCount = (s) => chosen.filter((p) => p.platformA === s || p.platformB === s).length;
  console.log(`\n${chosen.length} pairs; sealed ${chosen.filter((p) => p.sealed).length}; double-labelled ${chosen.filter((p) => p.labellers.length === 2).length}`);
  console.log(`by category: ${tally("categoryA")}`);
  console.log(`by band: ${tally("band")}`);
  console.log(`stores to cover: ${STORES_TO_COVER.map((s) => `${s} ${storeCount(s)}`).join(", ")}`);
  console.log(`written: ${OUT_FILE}\nsheets: ${SHEETS}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
  process.exit(0);
}
