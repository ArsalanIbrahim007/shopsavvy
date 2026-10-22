// 01-build-dataset.js — R2, step 1: the price histories turned into samples for the 7-day drop forecast (src/ml/forecast/features.js).
//
// Read-only. Each price history is joined to its listing by platform + address (most histories carry no listing reference) for the
// category; histories of switched-off stores are left out. Writes src/ml/forecast/dataset.json.
//
//   node src/scripts/ml/forecast/01-build-dataset.js

import { config } from "dotenv";
config({ quiet: true });
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import { DISABLED_PLATFORMS } from "../../../config/platforms.js";
import Listing from "../../../models/listing.model.js";
import PriceHistory from "../../../models/priceHistory.model.js";
import { buildSamples, FEATURE_NAMES, FORECAST, pkDay } from "../../../ml/forecast/features.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "ml", "forecast", "dataset.json");

// Prices have been recorded daily since 2026-09-27; before that, about every five days, a different regime (a 7-day window then
// held one or two records, and 10% of the few samples "dropped" against about 2% since). A sample needs MIN_HISTORY_DAYS of
// records behind it, so samples start a week after daily recording did.
const FIRST_SAMPLE_DATE = "2026-10-04";
const FIRST_SAMPLE_DAY = pkDay(`${FIRST_SAMPLE_DATE}T00:00:00+05:00`);

await mongoose.connect(process.env.MONGO_URI);
const started = Date.now();
const [histories, listings] = await Promise.all([
  PriceHistory.find({ platform: { $nin: DISABLED_PLATFORMS } }).select("platform sourceUrl listing entries").lean(),
  Listing.find({}).select("platform sourceUrl productCategory").lean(),
]);
await mongoose.disconnect();

const categoryOf = new Map(listings.map((l) => [`${l.platform}|${l.sourceUrl}`, l.productCategory]));
const categoryById = new Map(listings.map((l) => [String(l._id), l.productCategory]));
const prepared = histories
  .filter((h) => h.sourceUrl || h.listing)
  .map((h) => ({
    key: h.sourceUrl ? `${h.platform}|${h.sourceUrl}` : `id|${h.listing}`,
    platform: h.platform,
    category: categoryOf.get(`${h.platform}|${h.sourceUrl}`) ?? categoryById.get(String(h.listing)) ?? "other",
    entries: h.entries ?? [],
  }));

const samples = buildSamples(prepared).filter((s) => s.day >= FIRST_SAMPLE_DAY);
const round = (v) => Math.round(v * 1e5) / 1e5;
writeFileSync(OUT, JSON.stringify({
  builtAt: new Date().toISOString(),
  rules: FORECAST,
  firstSampleDate: FIRST_SAMPLE_DATE,
  featureNames: FEATURE_NAMES,
  // Compact rows: [listing number, platform, category, day, label, ...features]
  listings: [...new Set(samples.map((s) => s.key))].length,
  rows: (() => {
    const index = new Map();
    return samples.map((s) => {
      if (!index.has(s.key)) index.set(s.key, index.size);
      return [index.get(s.key), s.platform, s.category, s.day, s.label, ...s.features.map(round)];
    });
  })(),
}));

const positives = samples.filter((s) => s.label === 1).length;
console.log(`${histories.length} histories -> ${samples.length} samples from ${new Set(samples.map((s) => s.key)).size} listings; ${positives} fell ${FORECAST.DROP * 100}%+ within ${FORECAST.WINDOW_DAYS} days (${(100 * positives / samples.length).toFixed(2)}%), in ${Math.round((Date.now() - started) / 1000)} s -> ${OUT}`);
