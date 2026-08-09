// check-discounts.js — reports discount classification across seeded products
import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import PriceHistory from "./src/models/priceHistory.model.js";
import { attachPriceHistory } from "./src/services/historyEnrichment.service.js";
import { calculateFakeDiscountScore } from "./src/ranking/scores/fakeDiscountScore.js";

await mongoose.connect(process.env.MONGO_URI);

// Did the simulated flag survive the sub-schema?
const sample = await PriceHistory.findOne({ "entries.2": { $exists: true } }).lean();
console.log("simulated flag persisted:",
  sample?.entries?.some((e) => e.simulated) ? "YES" : "NO (stripped by schema)");
console.log();

const listings = await Listing.find({ price: { $gt: 20000 } }).sort({ price: -1 }).limit(20);
const enriched = await attachPriceHistory(listings);

const tally = {};

enriched.forEach((listing) => {
  const analysis = calculateFakeDiscountScore({
    currentPrice: listing.price,
    originalPrice: listing.originalPrice,
    priceHistory: listing.priceHistory,
  });

  tally[analysis.classification] = (tally[analysis.classification] || 0) + 1;

  console.log(
    (analysis.isFakeDiscount ? "FAKE " : "     ") +
    String(analysis.classification).padEnd(22) +
    "hist:" + String(listing.priceHistory.length).padStart(2) +
    "  now:" + String(listing.price).padStart(7) +
    "  orig:" + String(listing.originalPrice ?? "-").padStart(7) +
    "  ref:" + String(analysis.metrics?.historicalReferencePrice ?? "-").padStart(7) +
    "  " + listing.title.slice(0, 34)
  );
});

console.log("\nTALLY:", JSON.stringify(tally, null, 1));

const flagged = enriched.filter((l) =>
  calculateFakeDiscountScore({
    currentPrice: l.price,
    originalPrice: l.originalPrice,
    priceHistory: l.priceHistory,
  }).isFakeDiscount
);

console.log(`\nisFakeDiscount = true on ${flagged.length} / ${enriched.length} products`);

await mongoose.disconnect();