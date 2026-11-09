// 03-competitor-experiment.js — R2, an experiment (2026-11-09): does the drop forecast improve if it also sees the same product's
// price at the other stores?
//
// The forecast (01, 02) learns from one listing's own history. Stores watch each other, so two features were tried:
//   vsCheapestOther  this price / the cheapest other store's price for the same product that day - 1 (0 when no other store sells it)
//   otherFell7       the share of the product's other stores whose price fell 3%+ in the 7 days up to that day
// The product is the live grouping's (the trained matcher), so a listing's competitors are the offers shown beside it. The same
// samples, the same strict split by date (with the label week as a gap) and the same model as 02 are trained twice, with and without
// the two features, and compared. Read-only: it writes nothing but its printout. The model in use changes only if this shows a gain
// beyond noise (the interval of the AUC difference above zero).
//
//   node src/scripts/ml/forecast/03-competitor-experiment.js
//
// Result, 2026-11-09 (24,830 samples of the six categories, 9,127 with another store's price for the product; strict test 3,921
// samples, 34 drops at 22 listings):
//   as in use      AUC 0.641, average precision 0.070, top 10%: precision 2.3%, lift 2.65
//   + competitors  AUC 0.589, average precision 0.071, top 10%: precision 2.3%, lift 2.65
//   AUC change -0.052 (95% -0.087 to -0.019): worse, beyond noise. The features were not added to the model in use.
// (These figures are lower than FORECAST_REPORT.md's because the sample here is only listings still in the live grouping, and its
// test holds 34 drops against 99 there.) With drops on 0.8-1% of days, what the forecast lacks is drops to learn from; re-run 01 and 02
// after the 11.11 sales (2026-11-11), whose drops are labelled once the week after them has been recorded.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { DISABLED_PLATFORMS, VISIBLE_PLATFORMS_FILTER } from "../../../config/platforms.js";
import Listing from "../../../models/listing.model.js";
import PriceHistory from "../../../models/priceHistory.model.js";
import { buildSamples, CATEGORIES, dailySeries, fellInWeekTo, FORECAST, pkDay } from "../../../ml/forecast/features.js";
import { atTop, auc, averagePrecision, clusterBootstrap } from "../../../ml/forecast/metrics.js";
import { predictProba, trainLogisticRegression } from "../../../ml/logisticRegression.js";
import { groupListingsByProduct } from "../../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../../services/similarityModel.service.js";

const FIRST_SAMPLE_DAY = pkDay("2026-10-04T00:00:00+05:00"); // as 01
const STRICT_TEST_DAYS = 5; // as 02
const L2_GRID = [0.001, 0.01, 0.1, 1];
const TRAIN = { epochs: 1500, lr: 0.2 };
const started = Date.now();

await mongoose.connect(process.env.MONGO_URI);
const [histories, listings] = await Promise.all([
  PriceHistory.find({ platform: { $nin: DISABLED_PLATFORMS } }).select("platform sourceUrl entries").lean(),
  Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: { $in: CATEGORIES } }).lean(),
]);
await mongoose.disconnect();

// The product of each listing, from the live grouping of each category.
const productOf = new Map();
for (const category of CATEGORIES) {
  const groups = groupListingsByProduct(listings.filter((l) => l.productCategory === category), { matchStrategy: mlMatchStrategy });
  groups.forEach((group, i) => { for (const o of group.offers) productOf.set(`${o.platform}|${o.sourceUrl}`, `${category}#${i}`); });
}
const categoryOf = new Map(listings.map((l) => [`${l.platform}|${l.sourceUrl}`, l.productCategory]));
const prepared = histories
  .filter((h) => h.sourceUrl && categoryOf.has(`${h.platform}|${h.sourceUrl}`))
  .map((h) => ({ key: `${h.platform}|${h.sourceUrl}`, platform: h.platform, category: categoryOf.get(`${h.platform}|${h.sourceUrl}`), entries: h.entries ?? [] }));

const seriesOf = new Map(prepared.map((h) => [h.key, dailySeries(h.entries)]));
const members = new Map();
for (const h of prepared) {
  const product = productOf.get(h.key);
  if (!product) continue;
  if (!members.has(product)) members.set(product, []);
  members.get(product).push(h);
}
const priceOn = (series, day) => {
  let last = null;
  for (const point of series) { if (point.day > day) break; last = point; }
  return last && last.day > day - FORECAST.WINDOW_DAYS ? last.price : null; // a price older than a week is not today's competition
};

const samples = buildSamples(prepared).filter((s) => s.day >= FIRST_SAMPLE_DAY);
const listingIndex = new Map();
const rows = samples.map((s) => {
  const others = (members.get(productOf.get(s.key)) ?? []).filter((h) => h.key !== s.key && h.platform !== s.platform);
  const otherPrices = others.map((h) => priceOn(seriesOf.get(h.key), s.day)).filter((p) => p > 0);
  const vsCheapestOther = otherPrices.length ? s.price / Math.min(...otherPrices) - 1 : 0;
  const fell = others.map((h) => fellInWeekTo(seriesOf.get(h.key), s.day)).filter((r) => r !== null);
  const otherFell7 = fell.length ? fell.filter(Boolean).length / fell.length : 0;
  if (!listingIndex.has(s.key)) listingIndex.set(s.key, listingIndex.size);
  return { listing: listingIndex.get(s.key), day: s.day, label: s.label, base: s.features, extra: [...s.features, Math.max(-1, Math.min(1, vsCheapestOther)), otherFell7], hasOther: otherPrices.length > 0 };
});

const drops = (set) => set.filter((r) => r.label === 1).length;
function fit(train, key) {
  const fold = (listing) => listing % 3;
  const scored = L2_GRID.map((l2) => {
    const scores = [];
    const labels = [];
    for (let k = 0; k < 3; k++) {
      const inner = train.filter((r) => fold(r.listing) !== k);
      const held = train.filter((r) => fold(r.listing) === k);
      if (!drops(inner) || !drops(held)) continue;
      const model = trainLogisticRegression(inner.map((r) => r[key]), inner.map((r) => r.label), { ...TRAIN, l2 });
      for (const r of held) { scores.push(predictProba(r[key], model)); labels.push(r.label); }
    }
    return { l2, ap: averagePrecision(scores, labels) ?? 0 };
  });
  const best = [...scored].sort((a, b) => b.ap - a.ap)[0];
  return trainLogisticRegression(train.map((r) => r[key]), train.map((r) => r.label), { ...TRAIN, l2: best.l2 });
}

const lastDay = Math.max(...rows.map((r) => r.day));
const testStart = lastDay - STRICT_TEST_DAYS + 1;
const train = rows.filter((r) => r.day + FORECAST.WINDOW_DAYS < testStart);
const test = rows.filter((r) => r.day >= testStart);
const labels = test.map((r) => r.label);
const groups = test.map((r) => r.listing);
const scores = {};
for (const key of ["base", "extra"]) {
  const model = fit(train, key);
  scores[key] = test.map((r) => predictProba(r[key], model));
}
const fmt = (v) => (v === null ? "n/a" : v.toFixed(3));
const pct = (v) => `${(100 * v).toFixed(1)}%`;
console.log(`samples ${rows.length} (${rows.filter((r) => r.hasOther).length} with another store's price for the same product); train ${train.length} (${drops(train)} drops), test ${test.length} (${drops(test)} drops, ${new Set(test.filter((r) => r.label).map((r) => r.listing)).size} listings)`);
for (const key of ["base", "extra"]) {
  const top = atTop(scores[key], labels, 0.1);
  const flag = atTop(scores[key], labels, 0.05);
  console.log(`${key === "base" ? "as in use     " : "+ competitors "} AUC ${fmt(auc(scores[key], labels))}  AP ${fmt(averagePrecision(scores[key], labels))}  top 10%: precision ${pct(top.precision)} lift ${top.lift.toFixed(2)}  top 5%: precision ${pct(flag.precision)} lift ${flag.lift.toFixed(2)}`);
}
const pick = (key, ix) => auc(ix.map((i) => scores[key][i]), ix.map((i) => labels[i]));
const gain = clusterBootstrap(groups, (ix) => { const a = pick("extra", ix); const b = pick("base", ix); return a === null || b === null ? null : a - b; });
console.log(`AUC gain ${fmt(auc(scores.extra, labels) - auc(scores.base, labels))} (95% ${fmt(gain[0])} to ${fmt(gain[1])}), in ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(0);
