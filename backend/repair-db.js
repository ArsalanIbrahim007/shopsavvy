// repair-db.js — converts string _id / date fields back to proper BSON types
//
//   node repair-db.js --dry
//   node repair-db.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

const dryRun = process.argv.includes("--dry");
const DATE_FIELDS = [
  "createdAt", "updatedAt", "lastScrapedAt", "scrapedAt", "recordedAt",
];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

function fixDates(obj) {
  let changed = false;
  for (const field of DATE_FIELDS) {
    if (typeof obj[field] === "string" && ISO.test(obj[field])) {
      obj[field] = new Date(obj[field]);
      changed = true;
    }
  }
  if (Array.isArray(obj.entries)) {
    obj.entries.forEach((entry) => {
      if (typeof entry.recordedAt === "string" && ISO.test(entry.recordedAt)) {
        entry.recordedAt = new Date(entry.recordedAt);
        changed = true;
      }
    });
  }
  return changed;
}

for (const name of ["listings", "pricehistories"]) {
  const col = db.collection(name);
  const docs = await col.find({}).toArray();

  const stringIds = docs.filter((d) => typeof d._id === "string");
  console.log(`${name}: ${docs.length} docs, ${stringIds.length} with string _id`);

  if (dryRun) continue;

  const rebuilt = docs.map((doc) => {
    const copy = { ...doc };

    if (typeof copy._id === "string") {
      copy._id = new mongoose.Types.ObjectId(copy._id);
    }
    if (typeof copy.listing === "string") {
      copy.listing = new mongoose.Types.ObjectId(copy.listing);
    }

    fixDates(copy);
    return copy;
  });

  await col.deleteMany({});
  if (rebuilt.length) await col.insertMany(rebuilt);
  console.log(`  rebuilt ${rebuilt.length}`);
}

console.log(
  dryRun ? "\nDRY RUN — nothing written." : "\nRepair complete."
);

await mongoose.disconnect();