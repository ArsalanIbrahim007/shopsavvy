// fix-colours.js
// Recomputes ONLY the `colour` of every stored listing from its title, and writes the ones that changed.
// Colours stored before 2026-09-30 were found by plain substring matching, so "Redmi" was read as red
// ("Red 41" in the phone colour filter), "Blackview" as black and so on. New scrapes already store the
// right value; this repairs the listings saved earlier without touching any other field (unlike
// backfill-attributes.js, which rewrites every attribute).
//
//   node src/scripts/maintenance/fix-colours.js --dry     (shows what would change, writes nothing)
//   node src/scripts/maintenance/fix-colours.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "../../models/listing.model.js";
import { extractColour } from "../../services/productAttributes.service.js";

const dryRun = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find({}, { title: 1, colour: 1 }).lean();
console.log(`Listings checked: ${listings.length}\n`);

const transitions = new Map(); // "Red -> (none)" -> { count, example }
const changes = [];

for (const listing of listings) {
  const now = extractColour(listing.title);
  const before = listing.colour ?? null;
  if (now === before) continue;

  const key = `${before ?? "(none)"} -> ${now ?? "(none)"}`;
  const entry = transitions.get(key) ?? { count: 0, example: listing.title };
  entry.count += 1;
  transitions.set(key, entry);
  changes.push({ _id: listing._id, colour: now });
}

console.log("CHANGES BY KIND");
[...transitions.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([kind, { count, example }]) => console.log(`  ${String(count).padStart(4)}  ${kind.padEnd(28)} e.g. ${example.slice(0, 70)}`));

if (!dryRun && changes.length > 0) {
  const result = await Listing.bulkWrite(
    changes.map(({ _id, colour }) => ({ updateOne: { filter: { _id }, update: colour === null ? { $unset: { colour: "" } } : { $set: { colour } } } })),
    { ordered: false }
  );
  console.log(`\nUpdated ${result.modifiedCount} listings`);
} else {
  console.log(dryRun ? `\nDRY RUN - ${changes.length} listings would change, nothing written.` : "\nNothing to change.");
}

await mongoose.disconnect();
