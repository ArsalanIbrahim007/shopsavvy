// backfill-brands.js — gives every stored listing its brand as one lower-case key (productAttributes extractBrand): the store's own
// statement when it names a known brand, else the one the title names. Only `brand` is written.
//
// Only Mega and W11stop state a brand, so 126 of 6,299 phones had one and the brand filter was nearly empty (2026-11-10). New and
// re-scraped listings get their brand when they are saved; this brings the stored ones up to date at once.
//
//   node src/scripts/maintenance/backfill-brands.js            dry run: how many would change, by brand, with examples
//   node src/scripts/maintenance/backfill-brands.js --apply    write the changes
//
// Run it when no scrape is running: a scrape started before this change writes brands as the stores state them (mostly none).

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import Listing from "../../models/listing.model.js";
import { extractBrand } from "../../services/productAttributes.service.js";

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI);
try {
  const listings = await Listing.find({}, { title: 1, brand: 1 }).lean();
  const byBrand = new Map(); // new brand -> ids
  for (const listing of listings) {
    const brand = extractBrand(listing.title ?? "", listing.brand);
    if ((brand ?? null) === (listing.brand ?? null)) continue;
    const key = brand ?? "(none)";
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key).push(listing._id);
  }
  const changed = [...byBrand.values()].reduce((n, ids) => n + ids.length, 0);
  console.log(`${listings.length} listings read; ${changed} would get a brand or a corrected one.`);
  for (const [brand, ids] of [...byBrand].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) console.log(`  ${String(ids.length).padStart(6)}  ${brand}`);
  if (apply) {
    let written = 0;
    for (const [brand, ids] of byBrand) {
      for (let i = 0; i < ids.length; i += 1000) {
        const result = await Listing.updateMany({ _id: { $in: ids.slice(i, i + 1000) } }, { $set: { brand: brand === "(none)" ? null : brand } });
        written += result.modifiedCount;
      }
    }
    console.log(`\nWritten: ${written} listings.`);
  } else {
    console.log("\nDry run: nothing written. Add --apply to write these changes.");
  }
} finally {
  await mongoose.disconnect();
}
