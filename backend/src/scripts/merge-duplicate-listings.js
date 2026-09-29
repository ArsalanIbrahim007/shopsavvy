// merge-duplicate-listings.js — one-off repair for listings (and their price
// histories) that were stored more than once because their sourceUrl carried
// per-search tracking params (Telemart's ?_pos=&_sid=&_ss=). New scrapes are
// canonicalised in scraper.service.js; this merges what was already saved.
//
// For each (platform, canonical URL) with more than one listing:
//   - keeps the most recently scraped listing, rewrites its URL to canonical
//   - re-points price alerts and price-history refs from the duplicates to it
//   - merges every duplicate's price-history entries into one history record
//   - deletes the duplicates
//
// Dry run by default. Nothing is written without --apply.
//   node src/scripts/merge-duplicate-listings.js
//   node src/scripts/merge-duplicate-listings.js --apply

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import { canonicalSourceUrl } from "../services/scraper.service.js";

const APPLY = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const listingsCol = db.collection("listings");
const historyCol = db.collection("pricehistories");
const alertsCol = db.collection("pricealerts");

function groupBy(docs) {
  const map = new Map();
  for (const d of docs) {
    const key = `${d.platform}::${canonicalSourceUrl(d.sourceUrl)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return map;
}

const newest = (a, b) => new Date(b.lastScrapedAt || 0) - new Date(a.lastScrapedAt || 0);

// ── Listings ────────────────────────────────────────────────────────────
const listings = await listingsCol.find({}, { projection: { platform: 1, sourceUrl: 1, lastScrapedAt: 1, title: 1 } }).toArray();
const listingGroups = [...groupBy(listings).values()].filter(
  (g) => g.length > 1 || g[0].sourceUrl !== canonicalSourceUrl(g[0].sourceUrl)
);

let listingsToDelete = 0;
let alertsRemapped = 0;
let historyRefsRemapped = 0;

for (const group of listingGroups) {
  group.sort(newest);
  const [keep, ...dupes] = group;
  const dupeIds = dupes.map((d) => d._id);
  const canonical = canonicalSourceUrl(keep.sourceUrl);
  listingsToDelete += dupes.length;

  if (dupeIds.length) {
    alertsRemapped += await alertsCol.countDocuments({ listing: { $in: dupeIds } });
    historyRefsRemapped += await historyCol.countDocuments({ listing: { $in: dupeIds } });
  }

  if (APPLY) {
    if (dupeIds.length) {
      await alertsCol.updateMany({ listing: { $in: dupeIds } }, { $set: { listing: keep._id } });
      await historyCol.updateMany({ listing: { $in: dupeIds } }, { $set: { listing: keep._id } });
      await listingsCol.deleteMany({ _id: { $in: dupeIds } });
    }
    await listingsCol.updateOne({ _id: keep._id }, { $set: { sourceUrl: canonical, productUrl: canonical } });
  }
}

// ── Price histories ─────────────────────────────────────────────────────
const histories = await historyCol.find({}).toArray();
const historyGroups = [...groupBy(histories).values()].filter(
  (g) => g.length > 1 || g[0].sourceUrl !== canonicalSourceUrl(g[0].sourceUrl)
);

let historiesToDelete = 0;
let entriesBefore = 0;
let entriesAfter = 0;

for (const group of historyGroups) {
  group.sort(newest);
  const [keep, ...dupes] = group;
  historiesToDelete += dupes.length;

  // Merge all observations chronologically, dropping consecutive repeats of
  // the same price -- the same rule recordPrice() uses when writing.
  const all = group
    .flatMap((h) => h.entries || [])
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const merged = all.filter((e, i) => i === 0 || e.price !== all[i - 1].price);
  entriesBefore += all.length;
  entriesAfter += merged.length;

  const prices = merged.map((e) => e.price);
  const update = {
    sourceUrl: canonicalSourceUrl(keep.sourceUrl),
    entries: merged,
    currentPrice: keep.currentPrice ?? prices.at(-1) ?? null,
    lowestPrice: prices.length ? Math.min(...prices) : keep.lowestPrice,
    highestPrice: prices.length ? Math.max(...prices) : keep.highestPrice,
    listing: keep.listing ?? group.find((h) => h.listing)?.listing ?? null,
  };

  if (APPLY) {
    if (dupes.length) await historyCol.deleteMany({ _id: { $in: dupes.map((d) => d._id) } });
    await historyCol.updateOne({ _id: keep._id }, { $set: update });
  }
}

console.log(APPLY ? "APPLIED" : "DRY RUN — nothing written. Re-run with --apply to merge.");
console.log(`Listings:  ${listingGroups.length} products affected, ${listingsToDelete} duplicate listings ${APPLY ? "deleted" : "would be deleted"}`);
console.log(`           ${alertsRemapped} price alerts and ${historyRefsRemapped} history refs ${APPLY ? "re-pointed" : "would be re-pointed"} to the kept listing`);
console.log(`Histories: ${historyGroups.length} products affected, ${historiesToDelete} duplicate history records ${APPLY ? "deleted" : "would be deleted"}`);
console.log(`           ${entriesBefore} price observations merged into ${entriesAfter} (consecutive repeats dropped)`);

await mongoose.disconnect();
