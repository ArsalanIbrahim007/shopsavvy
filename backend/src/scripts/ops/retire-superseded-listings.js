// retire-superseded-listings.js — hides a store's old plain-address copies of products it now lists by variant
// (services/supersededListings.service.js). The nightly scrape does this after its catalogue reads; this runs it by hand.
//
//   node src/scripts/ops/retire-superseded-listings.js            count and list them, write nothing
//   node src/scripts/ops/retire-superseded-listings.js --apply    retire them

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { retireSupersededListings } from "../../services/supersededListings.service.js";

await mongoose.connect(process.env.MONGO_URI);
try {
  const result = await retireSupersededListings({ dryRun: !process.argv.includes("--apply") });
  console.log(`${result.retired} of ${result.checked} listings ${result.dryRun ? "would be" : "were"} retired: ${JSON.stringify(result.byStore)}`);
  result.examples.forEach((e) => console.log(`  ${e}`));
  if (result.dryRun) console.log("Dry run: nothing written. Add --apply to retire them.");
} finally {
  await mongoose.disconnect();
}
