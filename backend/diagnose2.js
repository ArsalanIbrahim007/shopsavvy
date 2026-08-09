// diagnose2.js — run with: node diagnose2.js
import { config } from "dotenv";
config();
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const listings = db.collection("listings");
const history  = db.collection("pricehistories");

console.log("=== SAMPLE *SCRAPED* LISTING (lowercase platform) ===");
console.dir(await listings.findOne({ platform: "priceoye" }), { depth: null });

console.log("\n=== SAMPLE *SCRAPED* PRICE HISTORY (no listing ref) ===");
console.dir(await history.findOne({ listing: null }), { depth: null });

console.log("\n=== FIELD PRESENCE ACROSS ALL LISTINGS ===");
for (const f of ["originalPrice","inStock","availability","sourceUrl","imageUrl","brand","normalizedTitle"]) {
  console.log(f.padEnd(16), await listings.countDocuments({ [f]: { $exists: true, $ne: null } }), "/ 73");
}

console.log("\n=== HOW MANY LISTINGS HAVE MATCHING HISTORY BY sourceUrl? ===");
const withUrl = await listings.countDocuments({ sourceUrl: { $exists: true, $ne: "" } });
console.log("listings with sourceUrl:", withUrl);
const urls = await history.distinct("sourceUrl");
console.log("distinct sourceUrls in history:", urls.length);
console.log("listings joinable via sourceUrl:",
  await listings.countDocuments({ sourceUrl: { $in: urls } }));

await mongoose.disconnect();