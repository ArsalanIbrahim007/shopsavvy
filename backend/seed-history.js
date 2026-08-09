// seed-history.js
// Generates representative price history so the fake-discount engine has
// enough data points to evaluate. Every generated entry is tagged
// source: "simulated" so seeded data stays distinguishable from scraped data.
//
//   node seed-history.js --dry
//   node seed-history.js
//   node seed-history.js --clean     (removes simulated entries only)

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import PriceHistory from "./src/models/priceHistory.model.js";

const DAYS_BACK = 45;
const POINTS = 8;

const dryRun = process.argv.includes("--dry");
const clean = process.argv.includes("--clean");

await mongoose.connect(process.env.MONGO_URI);

if (clean) {
  const result = await PriceHistory.updateMany(
    {},
    { $pull: { entries: { simulated: true } } }
  );
  console.log(`Cleaned simulated entries from ${result.modifiedCount} documents`);
  await mongoose.disconnect();
  process.exit(0);
}

/**
 * Builds a price series ending at the listing's current price.
 *
 * "genuine"  — price drifts gently, then genuinely drops. A real discount.
 * "fake"     — price is inflated shortly before the discount, so the headline
 *              saving is measured against a price nobody actually paid.
 */
function buildSeries(currentPrice, pattern) {
  const points = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = POINTS - 1; i >= 1; i--) {
    const daysAgo = Math.round((DAYS_BACK / POINTS) * i);
    const recordedAt = new Date(now - daysAgo * dayMs);

    let price;

    if (pattern === "fake") {
      // Baseline near the current price, then a spike just before the "sale"
      price = i <= 2
        ? Math.round(currentPrice * (1.18 + Math.random() * 0.06))
        : Math.round(currentPrice * (0.99 + Math.random() * 0.04));
    } else {
      // Gentle downward drift from a genuinely higher starting point
      const drift = 1 + (i / POINTS) * 0.14;
      price = Math.round(currentPrice * drift * (0.99 + Math.random() * 0.02));
    }

    points.push({ price, recordedAt, simulated: true });
  }

  return points;
}

const listings = await Listing.find({ price: { $gt: 20000 } })
  .sort({ price: -1 })
  .limit(20);

console.log(`Eligible listings: ${listings.length}\n`);

let updated = 0;

for (const [index, listing] of listings.entries()) {
  // Roughly every third product gets the fake-discount pattern
  const pattern = index % 3 === 1 ? "fake" : "genuine";
  const sourceUrl = listing.sourceUrl || listing.productUrl || `internal://listing/${listing._id}`;

  const series = buildSeries(listing.price, pattern);

  console.log(
    `${pattern.toUpperCase().padEnd(8)} ${String(listing.price).padStart(7)}  ${listing.title.slice(0, 45)}`
  );
  console.log(`         history: ${series.map((p) => p.price).join(" → ")} → ${listing.price}`);

  if (dryRun) continue;

  let document = await PriceHistory.findOne({ platform: listing.platform, sourceUrl });

  if (!document) {
    document = new PriceHistory({
      listing: listing._id,
      platform: listing.platform,
      sourceUrl,
      title: listing.title,
      currency: listing.currency || "PKR",
      source: "scraper",
      entries: [],
    });
  }

  if (!document.listing) document.listing = listing._id;

  // Drop any previously simulated entries so re-running stays idempotent
  document.entries = document.entries.filter((e) => !e.simulated);

  const realEntries = [...document.entries];
  document.entries = [...series, ...realEntries].sort(
    (a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)
  );

  const all = document.entries.map((e) => e.price).filter(Boolean);
  document.currentPrice = listing.price;
  document.lowestPrice = Math.min(...all, listing.price);
  document.highestPrice = Math.max(...all, listing.price);

  await document.save();
  updated++;
}

console.log(
  dryRun
    ? "\nDRY RUN — nothing written. Re-run without --dry to apply."
    : `\nUpdated ${updated} price history documents`
);

await mongoose.disconnect();