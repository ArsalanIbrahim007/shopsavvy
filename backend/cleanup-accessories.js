// cleanup-accessories.js
// Removes accessory listings that were saved before the scraper-side filter
// existed. Run with --dry first to preview, then without to delete.
//
//   node cleanup-accessories.js --dry
//   node cleanup-accessories.js

import { config } from "dotenv";
config();
import mongoose from "mongoose";

const ACCESSORY_KEYWORDS = [
  "cable", "case", "cover", "charger", "protector", "handsfree",
  "earphone", "pouch", "tempered", "adapter", "power bank", "powerbank",
  "screen guard", "back cover", "flip cover", "wallet case", "bumper",
  "skin", "sleeve", "stand", "holder", "mount", "dock",
  "stylus", "hub", "converter", "airpod", "earbud", "strap",
];

const dryRun = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const listings = db.collection("listings");
const history = db.collection("pricehistories");

const pattern = new RegExp(ACCESSORY_KEYWORDS.join("|"), "i");
const doomed = await listings.find({ title: pattern }).toArray();

console.log(`Total listings:      ${await listings.countDocuments()}`);
console.log(`Accessories matched: ${doomed.length}\n`);

doomed.forEach((listing) =>
  console.log(`  Rs ${String(listing.price).padStart(7)}  ${listing.title.slice(0, 70)}`)
);

if (dryRun) {
  console.log("\nDRY RUN — nothing deleted. Re-run without --dry to apply.");
} else {
  const urls = doomed.map((listing) => listing.sourceUrl).filter(Boolean);
  const ids = doomed.map((listing) => listing._id);

  const removedListings = await listings.deleteMany({ _id: { $in: ids } });
  const removedHistory = await history.deleteMany({
    $or: [{ sourceUrl: { $in: urls } }, { listing: { $in: ids } }],
  });

  console.log(`\nDeleted ${removedListings.deletedCount} listings`);
  console.log(`Deleted ${removedHistory.deletedCount} price history documents`);
  console.log(`Remaining listings: ${await listings.countDocuments()}`);
}

await mongoose.disconnect();