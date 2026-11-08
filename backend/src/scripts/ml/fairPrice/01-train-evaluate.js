// 01-train-evaluate.js — trains the fair-price model (a ridge linear regression on log price, one per category) and evaluates it on
// products it never saw, against two simple baselines. Writes src/ml/fairPrice/model.artifact.json and FAIR_PRICE_REPORT.md.
//
//   node src/scripts/ml/fairPrice/01-train-evaluate.js
//
// The data: every visible listing of the ten main categories with a believable price, checked within the last 45 days.
// The split: by PRODUCT, not by listing. A product's key is the first four words of its title plus its storage; a fifth of the keys
// (by a fixed hash) are held out with every store's listing of them, so the test measures prices of products the model has not seen
// at any store. The penalty (lambda) is chosen on a further product split inside the training set, before the test set is looked at.
// The model shipped is then refitted on all the data with that lambda; the figures reported are the held-out ones.

import { config } from "dotenv";
config({ quiet: true });
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import Listing from "../../../models/listing.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../../../config/platforms.js";
import { NUMERIC_FEATURES, categoricalTokens, numericValues, rowFor, titleTokens } from "../../../ml/fairPrice/features.js";
import { fitRidge, predictRidge } from "../../../ml/ridge.js";
import { normalizeTitle } from "../../../services/normalizeTitle.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "..", "..", "ml", "fairPrice");
export const CATEGORIES = ["smartphone", "laptop", "tv", "tablet", "smartwatch", "headphones", "air_conditioner", "refrigerator", "washing_machine", "monitor"];
const MIN_DF = 3; // a word must appear in at least this many training titles
const LAMBDAS = [0.3, 1, 3, 10, 30];
const DAY = 24 * 60 * 60 * 1000;

const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
const productKey = (listing) => {
  const words = normalizeTitle(listing.title).split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return `${words}|${numericValues(listing).logStorage ?? ""}`;
};
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};

/** The vocabulary and numeric scaling, learned from training listings only. */
function buildModelShape(train) {
  const df = new Map();
  for (const l of train) for (const t of new Set([...titleTokens(l.title), ...categoricalTokens(l)])) df.set(t, (df.get(t) ?? 0) + 1);
  const index = {};
  let dim = 0;
  for (const [token, count] of df) if (count >= MIN_DF) index[token] = dim++;
  const numeric = {};
  for (const name of NUMERIC_FEATURES) {
    const values = train.map((l) => numericValues(l)[name]).filter((v) => v !== null && v !== undefined);
    if (values.length < 20) continue; // a number this category's titles rarely state
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length) || 1;
    numeric[name] = { index: dim++, missingIndex: dim++, mean, std };
  }
  return { index, numeric, dim };
}

function fit(train, lambda) {
  const shape = buildModelShape(train);
  const rows = train.map((l) => rowFor(l, shape));
  const y = train.map((l) => Math.log(l.price));
  const { weights, intercept, iterations } = fitRidge(rows, y, shape.dim, { lambda });
  return { ...shape, weights, intercept, lambda, iterations };
}

/** Errors on `test`: the predicted price against the real one. */
function evaluate(model, test) {
  const ape = [];
  const logResiduals = [];
  let ssRes = 0;
  const logs = test.map((l) => Math.log(l.price));
  const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
  let ssTot = 0;
  test.forEach((l, i) => {
    const predicted = predictRidge(rowFor(l, model), model);
    ape.push(Math.abs(Math.exp(predicted) - l.price) / l.price);
    logResiduals.push(logs[i] - predicted);
    ssRes += (logs[i] - predicted) ** 2;
    ssTot += (logs[i] - meanLog) ** 2;
  });
  return { ape, logResiduals, r2: 1 - ssRes / ssTot };
}

const summarise = (ape) => ({ mdape: median(ape), within15: ape.filter((e) => e <= 0.15).length / ape.length, within25: ape.filter((e) => e <= 0.25).length / ape.length });

/** Baseline errors: the category's median price, and the median of the same first word (brand) and storage. */
function baselines(train, test) {
  const catMedian = median(train.map((l) => l.price));
  const byBrandStorage = new Map();
  const byBrand = new Map();
  for (const l of train) {
    const brand = normalizeTitle(l.title).split(/\s+/)[0];
    const key = `${brand}|${numericValues(l).logStorage ?? ""}`;
    byBrandStorage.set(key, [...(byBrandStorage.get(key) ?? []), l.price]);
    byBrand.set(brand, [...(byBrand.get(brand) ?? []), l.price]);
  }
  const brandStorageApe = test.map((l) => {
    const brand = normalizeTitle(l.title).split(/\s+/)[0];
    const prices = byBrandStorage.get(`${brand}|${numericValues(l).logStorage ?? ""}`) ?? byBrand.get(brand);
    const guess = prices ? median(prices) : catMedian;
    return Math.abs(guess - l.price) / l.price;
  });
  return { category: summarise(test.map((l) => Math.abs(catMedian - l.price) / l.price)), brandStorage: summarise(brandStorageApe) };
}

await mongoose.connect(process.env.MONGO_URI);
const artifact = { trainedAt: new Date().toISOString(), method: "ridge linear regression on log price, per category", categories: {} };
const report = [];
try {
  const since = new Date(Date.now() - 45 * DAY);
  for (const category of CATEGORIES) {
    const listings = (await Listing.find({
      ...VISIBLE_PLATFORMS_FILTER,
      productCategory: category,
      price: { $gt: 0 },
      isActive: { $ne: false },
      lastScrapedAt: { $gte: since },
      "priceCheck.status": { $not: /^suspect/ },
    }, { title: 1, price: 1, platform: 1, condition: 1, ptaStatus: 1, storageGb: 1, ramGb: 1, screenInches: 1 }).lean()).filter((l) => l.title);
    if (listings.length < 200) continue;

    const isTest = (l) => hash(productKey(l)) % 5 === 0;
    const train = listings.filter((l) => !isTest(l));
    const test = listings.filter(isTest);

    // lambda, on a product split inside the training set
    const isValidation = (l) => hash(`v${productKey(l)}`) % 5 === 0;
    const inner = train.filter((l) => !isValidation(l));
    const validation = train.filter(isValidation);
    const scores = LAMBDAS.map((lambda) => ({ lambda, mdape: median(evaluate(fit(inner, lambda), validation).ape) }));
    const { lambda } = scores.reduce((best, s) => (s.mdape < best.mdape ? s : best));

    const heldOut = evaluate(fit(train, lambda), test);
    const base = baselines(train, test);
    const model = fit(listings, lambda); // shipped: all the data, the chosen lambda
    const metrics = { ...summarise(heldOut.ape), r2: heldOut.r2, trainListings: train.length, testListings: test.length, lambda, baselines: base };
    artifact.categories[category] = {
      index: model.index,
      numeric: model.numeric,
      weights: model.weights.map((w) => Number(w.toFixed(6))),
      intercept: model.intercept,
      lambda,
      residual: { p10: quantile(heldOut.logResiduals, 0.1), p90: quantile(heldOut.logResiduals, 0.9) },
      metrics,
    };
    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    report.push(`| ${category} | ${listings.length} | ${test.length} | **${pct(metrics.mdape)}** | ${pct(metrics.within15)} | ${metrics.r2.toFixed(3)} | ${pct(base.brandStorage.mdape)} | ${pct(base.category.mdape)} | ${lambda} |`);
    console.log(`${category.padEnd(16)} ${String(listings.length).padStart(6)} listings  held-out median error ${pct(metrics.mdape)} (brand+storage median ${pct(base.brandStorage.mdape)}, category median ${pct(base.category.mdape)})  within 15%: ${pct(metrics.within15)}  R² ${metrics.r2.toFixed(3)}  λ=${lambda}`);
  }
} finally {
  await mongoose.disconnect();
}

writeFileSync(join(OUT_DIR, "model.artifact.json"), JSON.stringify(artifact));
writeFileSync(join(OUT_DIR, "FAIR_PRICE_REPORT.md"), `# Fair price for these specs (linear regression)

Generated ${artifact.trainedAt} by \`src/scripts/ml/fairPrice/01-train-evaluate.js\`.

**Model:** ridge linear regression on the log of the price, one per category (\`src/ml/ridge.js\`, hand-written, conjugate gradient).
**Features** (\`src/ml/fairPrice/features.js\`): the title's words and neighbouring word pairs, storage and RAM (log2), screen size,
tonnage, drum kg, litres, inverter, the store, the condition and the PTA status.

**Test:** products the model never saw. A product is the first four words of its title plus its storage; a fifth of the products are
held out with every store's listing of them. The penalty λ was chosen on a product split inside the training data. Errors are
|predicted − real| / real.

| Category | Listings | Held out | Median error | Within 15% | R² (log price) | Baseline: brand + storage median | Baseline: category median | λ |
|---|---|---|---|---|---|---|---|---|
${report.join("\n")}

**How it is used:** the fair price for a listing's specs is the model's prediction; a listing priced below it by more than the
model's usual error is a good price for what it is, even when no other store sells the same product. A claimed "was" price far above
the fair price is evidence against a discount, even without price history.
`);
console.log(`\nWrote ${join(OUT_DIR, "model.artifact.json")} and FAIR_PRICE_REPORT.md`);
