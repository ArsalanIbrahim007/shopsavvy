// recategorise.js — re-reads every stored listing's category from its title with the current rules (scrapers/productCategory.js)
// and, with --apply, writes the ones that changed. Only `productCategory` is written; nothing else about a listing is touched.
//
// A listing's category is set from its title each time it is scraped, so after a change to the rules the listings would only catch
// up as the nightly scrape reaches them (about every three nights). This brings them up to date at once.
//
//   node src/scripts/maintenance/recategorise.js            dry run: what would change, by old -> new category, with examples
//   node src/scripts/maintenance/recategorise.js --apply    write the changes
//
// Run it when no scrape is running, so the two do not write the same listings at once.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import Listing from "../../models/listing.model.js";
import { detectCategory } from "../../scrapers/productCategory.js";

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI);
try {
  const listings = await Listing.find({}, { title: 1, productCategory: 1 }).lean();
  const changes = new Map(); // "old -> new" -> ids
  const examples = new Map();
  for (const listing of listings) {
    const now = detectCategory(listing.title ?? "").category;
    if (now === listing.productCategory) continue;
    const key = `${listing.productCategory} -> ${now}`;
    if (!changes.has(key)) { changes.set(key, []); examples.set(key, []); }
    changes.get(key).push(listing._id);
    if (examples.get(key).length < 3) examples.get(key).push(listing.title);
  }

  const total = [...changes.values()].reduce((n, ids) => n + ids.length, 0);
  console.log(`${listings.length} listings read; ${total} would change category.\n`);
  for (const [key, ids] of [...changes].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(ids.length).padStart(6)}  ${key}`);
    for (const title of examples.get(key)) console.log(`          e.g. ${String(title).slice(0, 90)}`);
  }

  if (!apply) {
    console.log("\nDry run: nothing written. Add --apply to write these changes.");
  } else {
    let written = 0;
    for (const [key, ids] of changes) {
      const category = key.split(" -> ")[1];
      const result = await Listing.updateMany({ _id: { $in: ids } }, { $set: { productCategory: category } });
      written += result.modifiedCount;
    }
    console.log(`\nWritten: ${written} listings.`);
  }
} finally {
  await mongoose.disconnect();
}
