// verify.js — confirms patches 1-3 across all listings, not just the first offer
import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import { attachPriceHistory } from "./src/services/historyEnrichment.service.js";
import { calculateTrustScore } from "./src/ranking/scores/trustScore.js";

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find().limit(200);
const enriched = await attachPriceHistory(listings);

const withHistory = enriched.filter((l) => l.priceHistory.length > 0);
const deepEnough = enriched.filter((l) => l.priceHistory.length >= 3);

console.log("listings:              ", enriched.length);
console.log("with ANY history:      ", withHistory.length);
console.log("with >=3 entries:      ", deepEnough.length, " <- fake-discount needs this");

console.log("\nTRUST BY PLATFORM");
const seen = new Map();
enriched.forEach((l) => seen.set(l.platform, calculateTrustScore(l.platform, 20)));
[...seen.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([p, s]) => console.log("  " + p.padEnd(14), s, s === 12 ? "  <- STILL DEFAULTING" : ""));

console.log("\nDEEPEST HISTORIES");
enriched
  .sort((a, b) => b.priceHistory.length - a.priceHistory.length)
  .slice(0, 5)
  .forEach((l) =>
    console.log("  " + String(l.priceHistory.length).padStart(2), l.title.slice(0, 55))
  );

await mongoose.disconnect();