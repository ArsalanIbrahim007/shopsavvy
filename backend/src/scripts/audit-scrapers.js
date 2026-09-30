// audit-scrapers.js — read-only report on how complete and how fresh each
// platform's stored data is. It is the yardstick for scraper work: run it
// before and after a change and compare.
//
// Reports, per platform:
//   listings     how many are stored
//   image        share with an image URL
//   was-price    share with an original ("was") price. Low is expected for
//                stores that rarely discount, so verify against the site
//                before treating a low number as a bug
//   rating       share with a rating (scrapers send it via the optional rating field)
//   storage      share where a storage capacity could be read from the title
//   other/acc    share classified as "other" or "accessory": a high share means
//                the category classifier or the search filter is letting junk in
//   used         share marked used, refurbished or open-box
//   last scrape  most recent lastScrapedAt
// and a listings-per-category-per-platform grid, which shows coverage gaps
// (a category one store never returns cannot be compared across stores).
//
// Usage (from backend/):
//   node src/scripts/audit-scrapers.js
//   node src/scripts/audit-scrapers.js --all     include disabled platforms

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { DISABLED_PLATFORMS } from "../config/platforms.js";

const includeDisabled = process.argv.includes("--all");

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "-");

await mongoose.connect(process.env.MONGO_URI);
const listings = mongoose.connection.db.collection("listings");

const all = (await listings.distinct("platform")).sort();
const platforms = includeDisabled ? all : all.filter((p) => !DISABLED_PLATFORMS.includes(p));

const rows = [];
for (const platform of platforms) {
  const total = await listings.countDocuments({ platform });
  const count = (query) => listings.countDocuments({ platform, ...query });
  const [latest] = await listings
    .find({ platform })
    .sort({ lastScrapedAt: -1 })
    .limit(1)
    .project({ lastScrapedAt: 1 })
    .toArray();

  rows.push({
    platform,
    listings: total,
    image: pct(await count({ imageUrl: { $nin: [null, ""] } }), total),
    "was-price": pct(await count({ originalPrice: { $gt: 0 } }), total),
    rating: pct(await count({ rating: { $gt: 0 } }), total),
    storage: pct(await count({ storageGb: { $ne: null } }), total),
    "other": pct(await count({ productCategory: "other" }), total),
    "accessory": pct(await count({ productCategory: "accessory" }), total),
    used: pct(await count({ condition: { $in: ["used", "refurbished", "open_box"] } }), total),
    "last scrape": latest?.lastScrapedAt?.toISOString().slice(0, 10) ?? "-",
  });
}

console.log(`\nData completeness per platform${includeDisabled ? " (including disabled)" : ""}`);
console.table(rows);

const byCell = await listings
  .aggregate([
    { $match: includeDisabled ? {} : { platform: { $nin: DISABLED_PLATFORMS } } },
    { $group: { _id: { category: "$productCategory", platform: "$platform" }, n: { $sum: 1 } } },
  ])
  .toArray();

const grid = {};
for (const { _id: cell, n } of byCell) {
  (grid[cell.category || "other"] ||= {})[cell.platform] = n;
}
console.log("\nListings per category and platform (empty = none stored)");
console.table(grid);

await mongoose.disconnect();
