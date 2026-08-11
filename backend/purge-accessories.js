// purge-accessories.js
// Removes stored listings that are accessories, components or test records.
// The scrape-time filter cannot remove documents saved before it existed.
//
// "other" is deliberately NOT treated as junk: unrecognised but genuine
// products, such as Galaxy Z foldables, land there when no keyword matches.
//
//   node purge-accessories.js --dry
//   node purge-accessories.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import { detectCategory } from "./src/scrapers/productCategory.js";

const dryRun = process.argv.includes("--dry");

// Titles matching these are components or test data, never sellable products
// in their own right within the scope of this project.
const JUNK = [
  /\blaptop battery\b/i,
  /\bbattery\b.*\b(dell|hp|lenovo|acer|asus|probook|elitebook|latitude|inspiron|ideapad|thinkpad|vostro|pavilion|precision)\b/i,
  /\b(dell|hp|lenovo|acer|asus)\b.*\bbattery\b/i,
  /\b(ram|memory)\s+for\s+laptop\b/i,
  /\blaptop\s+(ram|memory)\b/i,
  /\bso[-\s]?dimm\b/i,
  /\bbac?kpack\b/i,
  /^test product/i,
];

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find().lean();

const doomed = listings.filter((listing) => {
  const title = String(listing.title || "");

  // Nothing priced above PKR 100,000 is an accessory. Two Samsung
  // refrigerators were classified as accessories because "Top Mount" and
  // "Cooling" match accessory keywords, and no appliance keyword outweighs
  // them. A price floor is a blunt guard but it cannot delete a real product.
  if (Number(listing.price) > 100000) return false;

  if (JUNK.some((pattern) => pattern.test(title))) return true;
  return detectCategory(title).category === "accessory";
});

console.log(`Total listings: ${listings.length}`);
console.log(`Accessories, components and test records: ${doomed.length}\n`);

doomed.forEach((l) =>
  console.log(`  ${String(l.price).padStart(8)}  ${String(l.title).slice(0, 62)}`)
);

if (dryRun) {
  console.log("\nDRY RUN - nothing deleted.");
} else {
  const ids = doomed.map((l) => l._id);
  const urls = doomed.map((l) => l.sourceUrl).filter(Boolean);
  const db = mongoose.connection.db;

  const removed = await db.collection("listings").deleteMany({ _id: { $in: ids } });
  const removedHistory = await db.collection("pricehistories").deleteMany({
    $or: [{ listing: { $in: ids } }, { sourceUrl: { $in: urls } }],
  });

  console.log(`\nDeleted ${removed.deletedCount} listings`);
  console.log(`Deleted ${removedHistory.deletedCount} price history documents`);
  console.log(`Remaining: ${await Listing.countDocuments()}`);
}

await mongoose.disconnect();