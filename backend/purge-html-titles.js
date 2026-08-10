// purge-html-titles.js
// Removes listings whose title contains raw HTML. These were produced before
// cleanText stripped tags, and one of them was appearing in search results.
//
//   node purge-html-titles.js --dry
//   node purge-html-titles.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

const dryRun = process.argv.includes("--dry");
const PATTERN = /<img|<div|<span|<a |src=/i;

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const listings = db.collection("listings");
const history = db.collection("pricehistories");

const doomed = await listings.find({ title: { $regex: PATTERN } }).toArray();

console.log(`Total listings: ${await listings.countDocuments()}`);
console.log(`Titles containing HTML: ${doomed.length}\n`);

doomed.forEach((l) =>
  console.log(`  ${String(l.platform).padEnd(10)} ${String(l.price).padStart(8)}  ${String(l.title).slice(0, 60)}`)
);

if (dryRun) {
  console.log("\nDRY RUN - nothing deleted.");
} else {
  const ids = doomed.map((l) => l._id);
  const urls = doomed.map((l) => l.sourceUrl).filter(Boolean);

  const removedListings = await listings.deleteMany({ _id: { $in: ids } });
  const removedHistory = await history.deleteMany({
    $or: [{ listing: { $in: ids } }, { sourceUrl: { $in: urls } }],
  });

  console.log(`\nDeleted ${removedListings.deletedCount} listings`);
  console.log(`Deleted ${removedHistory.deletedCount} price history documents`);
  console.log(`Remaining: ${await listings.countDocuments()}`);
}

await mongoose.disconnect();