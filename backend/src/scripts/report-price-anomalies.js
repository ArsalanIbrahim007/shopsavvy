// report-price-anomalies.js — read-only report of prices that look wrong, so a
// scraper owner can see exactly which of their listings to check on the live
// site. It complements audit-scrapers.js (how complete is the data) with "how
// believable is it".
//
// Sections:
//   1. Price out of line with the other stores selling the same product
//      (the check the ranking engine applies: below 0.5x or above 2x the median
//      of the other offers in the product group; needs 2+ other offers)
//   2. "Was" price at or below the current price: not a discount, a parse error
//      or a stale value. (New scrapes drop these automatically.)
//   3. "Was" price more than 3x the current price: real markdowns of this size
//      are rare, so check the page
//   4. Price below the minimum plausible (PKR 100). (New scrapes skip these.)
//   5. Far outside its category's normal range (below a quarter of the 5th
//      percentile or above 4x the 95th, phones, laptops, TVs, tablets). In
//      practice these are mostly accessories, books and articles that were
//      classified as a device, which is a category-classifier problem
//
// Usage (from backend/):
//   node src/scripts/report-price-anomalies.js
//   node src/scripts/report-price-anomalies.js --platform telemart
//   node src/scripts/report-price-anomalies.js --limit 40

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import { groupListingsByProduct } from "../services/productGrouping.service.js";
import { mlMatchStrategy } from "../services/similarityModel.service.js";
import { analyzePricePlausibility } from "../services/pricePlausibility.service.js";
import { MIN_PLAUSIBLE_PRICE } from "../services/priceSanity.service.js";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const onlyPlatform = argValue("--platform");
const limit = Number(argValue("--limit")) || 15;

await mongoose.connect(process.env.MONGO_URI);
const all = await mongoose.connection.db
  .collection("listings")
  .find({ ...VISIBLE_PLATFORMS_FILTER })
  .project({ platform: 1, title: 1, price: 1, originalPrice: 1, productCategory: 1, sourceUrl: 1 })
  .toArray();
await mongoose.disconnect();

const listings = all.filter((l) => l.price > 0).sort((a, b) => String(a._id).localeCompare(String(b._id)));
const mine = (l) => !onlyPlatform || l.platform === onlyPlatform;

const line = (l, extra = "") =>
  `  ${l.platform.padEnd(10)} ${String(l.price).padStart(9)}${extra}  ${l.title.slice(0, 70)}`;

function section(title, rows, describe) {
  const shown = rows.filter(mine);
  const perPlatform = {};
  shown.forEach((l) => { perPlatform[l.platform] = (perPlatform[l.platform] || 0) + 1; });
  console.log(`\n${title}: ${shown.length}${shown.length ? "  " + JSON.stringify(perPlatform) : ""}`);
  shown.slice(0, limit).forEach((l) => console.log(describe(l)));
  if (shown.length > limit) console.log(`  ... ${shown.length - limit} more (use --limit)`);
}

// 1. out of line with the product group
const byCategory = new Map();
for (const l of listings) {
  const c = l.productCategory || "other";
  if (!byCategory.has(c)) byCategory.set(c, []);
  byCategory.get(c).push(l);
}
const suspects = [];
for (const [category, items] of byCategory) {
  if (["accessory", "other"].includes(category)) continue;
  for (const group of groupListingsByProduct(items, { matchStrategy: mlMatchStrategy })) {
    if (group.offers.length < 3) continue;
    for (const offer of group.offers) {
      const check = analyzePricePlausibility(offer, group.offers);
      if (check.status.startsWith("suspect")) suspects.push({ ...offer, check });
    }
  }
}
section("1. Price out of line with the other stores selling the same product", suspects, (l) =>
  line(l, `  x${l.check.ratio} of PKR ${l.check.referencePrice}`));

// 2-4. price consistency
section("2. Was-price at or below the current price (not a discount)",
  listings.filter((l) => l.originalPrice && l.originalPrice <= l.price),
  (l) => line(l, `  was ${l.originalPrice}`));

section("3. Was-price more than 3x the current price",
  listings.filter((l) => l.originalPrice && l.originalPrice > l.price * 3),
  (l) => line(l, `  was ${l.originalPrice}`));

// (listings above already excludes price <= 0; look at the raw list for the floor)
section(`4. Price below PKR ${MIN_PLAUSIBLE_PRICE}`,
  all.filter((l) => l.price > 0 && l.price < MIN_PLAUSIBLE_PRICE),
  (l) => line(l));

// 5. far outside the category's normal range
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const extremes = [];
for (const category of ["smartphone", "laptop", "tv", "tablet"]) {
  const items = listings.filter((l) => l.productCategory === category);
  if (items.length < 20) continue;
  const prices = items.map((l) => l.price);
  const low = percentile(prices, 0.05) * 0.25;
  const high = percentile(prices, 0.95) * 4;
  items.filter((l) => l.price < low || l.price > high).forEach((l) => extremes.push({ ...l, category }));
}
section("5. Far outside the category's normal range (usually a misclassified accessory, book or article)",
  extremes.sort((a, b) => a.price - b.price),
  (l) => line(l, `  [${l.category}]`));

console.log(`\n${listings.length} listings checked${onlyPlatform ? ` (report limited to ${onlyPlatform})` : ""}.`);
