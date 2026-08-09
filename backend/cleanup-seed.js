// cleanup-seed.js
// Removes the original seed listings. They predate the scrapers, carry store
// homepages instead of product URLs, use different platform casing, and have
// stale timestamps that depress the freshness score.
//
//   node cleanup-seed.js --dry
//   node cleanup-seed.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

const dryRun = process.argv.includes("--dry");
const ROOT_URLS = [
  "https://priceoye.pk",
  "https://mega.pk",
  "https://shophive.com",
  "https://www.shophive.com",
];

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const listings = db.collection("listings");
const history = db.collection("pricehistories");

const doomed = await listings
  .find({ $or: [{ productUrl: { $in: ROOT_URLS } }, { productUrl: { $in: [null, ""] } }] })
  .toArray();

console.log(`Total listings: ${await listings.countDocuments()}`);
console.log(`Seed listings to remove: ${doomed.length}\n`);

doomed.forEach((l) =>
  console.log(
    `  ${String(l.platform).padEnd(10)} ${String(l.price).padStart(8)}  ` +
    `${String(l.productUrl || "(none)").padEnd(24)}  ${String(l.title).slice(0, 40)}`
  )
);

if (dryRun) {
  console.log("\nDRY RUN — nothing deleted.");
} else {
  const ids = doomed.map((l) => l._id);
  const removed = await listings.deleteMany({ _id: { $in: ids } });
  const removedHistory = await history.deleteMany({ listing: { $in: ids } });

  console.log(`\nDeleted ${removed.deletedCount} listings`);
  console.log(`Deleted ${removedHistory.deletedCount} price history documents`);
  console.log(`Remaining: ${await listings.countDocuments()}`);
}

await mongoose.disconnect();