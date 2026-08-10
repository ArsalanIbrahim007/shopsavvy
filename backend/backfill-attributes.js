// backfill-attributes.js
// Classifies every stored listing and writes its attributes. Existing records
// predate attribute extraction and therefore have no category, which would
// exclude them from category-filtered searches.
//
//   node backfill-attributes.js --dry
//   node backfill-attributes.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import { extractAttributes } from "./src/services/productAttributes.service.js";

const dryRun = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find().lean();
console.log(`Listings to process: ${listings.length}\n`);

const tally = {};
let updated = 0;

for (const listing of listings) {
  const attributes = extractAttributes(listing.title);
  tally[attributes.productCategory] = (tally[attributes.productCategory] || 0) + 1;

  if (!dryRun) {
    await Listing.updateOne({ _id: listing._id }, { $set: attributes });
    updated++;
  }
}

console.log("CATEGORY DISTRIBUTION");
Object.entries(tally)
  .sort((a, b) => b[1] - a[1])
  .forEach(([category, count]) => console.log(`  ${category.padEnd(12)} ${count}`));

console.log(dryRun ? "\nDRY RUN - nothing written." : `\nUpdated ${updated} listings`);

await mongoose.disconnect();