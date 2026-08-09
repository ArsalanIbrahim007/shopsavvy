// trim-history.js — keeps only the most recent N entries per document.
// Repeated seeding stacks entries because the simulated flag does not persist
// through the sub-schema, so they cannot be removed selectively.
//
//   node trim-history.js --dry
//   node trim-history.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import PriceHistory from "./src/models/priceHistory.model.js";

const KEEP = 8;
const dryRun = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI);

const documents = await PriceHistory.find({ [`entries.${KEEP}`]: { $exists: true } });
console.log(`Documents with more than ${KEEP} entries: ${documents.length}\n`);

for (const document of documents) {
  const before = document.entries.length;

  const trimmed = [...document.entries]
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
    .slice(-KEEP);

  console.log(`  ${before} -> ${trimmed.length}   ${String(document.title).slice(0, 46)}`);

  if (dryRun) continue;

  document.entries = trimmed;

  const prices = trimmed.map((e) => e.price).filter(Boolean);
  if (prices.length) {
    document.lowestPrice = Math.min(...prices);
    document.highestPrice = Math.max(...prices);
    document.currentPrice = trimmed[trimmed.length - 1].price;
  }

  await document.save();
}

console.log(dryRun ? "\nDRY RUN — nothing written." : `\nTrimmed ${documents.length} documents`);
await mongoose.disconnect();