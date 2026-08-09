// seed-fake-discount.js
// Sets an inflated originalPrice on a few products that already have history,
// producing the pattern the detection engine is designed to catch: a headline
// "discount" measured against a price the product never genuinely sold at.
//
//   node seed-fake-discount.js --dry
//   node seed-fake-discount.js

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import { attachPriceHistory } from "./src/services/historyEnrichment.service.js";
import { calculateFakeDiscountScore } from "./src/ranking/scores/fakeDiscountScore.js";

const dryRun = process.argv.includes("--dry");
const INFLATION = 1.45; // ~45% above reference — past the 20% threshold, still plausible

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find({ price: { $gt: 20000 } }).sort({ price: -1 }).limit(20);
const enriched = await attachPriceHistory(listings);

// Only products with enough history can be evaluated at all
const eligible = enriched.filter((l) => l.priceHistory.length >= 3);
const targets = eligible.slice(0, 4);

console.log(`Eligible (>=3 history): ${eligible.length}`);
console.log(`Marking ${targets.length} as fake discounts\n`);

for (const listing of targets) {
  const prices = listing.priceHistory.map((p) => Number(p.price)).filter(Boolean);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const inflatedOriginal = Math.round(median * INFLATION);

  const analysis = calculateFakeDiscountScore({
    currentPrice: listing.price,
    originalPrice: inflatedOriginal,
    priceHistory: listing.priceHistory,
  });

  console.log(listing.title.slice(0, 44));
  console.log(
    `   current ${listing.price}  median ${median}  ` +
    `originalPrice ${listing.originalPrice ?? "-"} -> ${inflatedOriginal}`
  );
  console.log(
    `   => ${analysis.classification}  isFake:${analysis.isFakeDiscount}  ` +
    `risk:${analysis.fakeDiscountRisk}  claimed:${analysis.claimedDiscountPercent}%\n`
  );

  if (!dryRun) {
    await Listing.updateOne(
      { _id: listing._id },
      { $set: { originalPrice: inflatedOriginal } }
    );
  }
}

console.log(
  dryRun
    ? "DRY RUN — nothing written. Re-run without --dry to apply."
    : `Updated ${targets.length} listings`
);

await mongoose.disconnect();