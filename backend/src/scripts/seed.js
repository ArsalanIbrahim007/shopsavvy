// seed.js
// Runs all fixed scrapers for a list of search queries and saves
// results into MongoDB. Also records price history for each product.
//
// Usage:
//   node src/scripts/seed.js                    — seeds default queries
//   node src/scripts/seed.js "samsung galaxy"   — seeds a specific query
//
// Options:
//   --clear    Wipe existing listings before seeding (fresh start)
//   --all      Also run Google discovery layer (uses SerpApi + Groq quota)

import { config } from "dotenv";
config();

import { connectDB } from "../config/db.js";
import Listing from "../models/listing.model.js";
import PriceHistory from "../models/priceHistory.model.js";
import { scrapeAllPlatforms } from "../scrapers/index.js";
import { normalizeTitle } from "../services/normalizeTitle.service.js";

// Default queries to seed if none provided via CLI
const DEFAULT_QUERIES = [
  "iphone 15",
  "samsung galaxy s24",
  "macbook air",
  "dell laptop",
  "playstation 5",
];

function toListingDoc(scraped) {
  return {
    platform:        scraped.platform,
    title:           scraped.title,
    normalizedTitle: normalizeTitle(scraped.title), // Arsalan's field
    price:           scraped.price,
    originalPrice:   scraped.originalPrice ?? null,
    currency:        "PKR",
    sourceUrl:       scraped.sourceUrl,
    productUrl:      scraped.sourceUrl,
    imageUrl:        scraped.imageUrl ?? "",
    brand:           scraped.brand ?? null,
    category:        "Electronics",
    inStock:         scraped.inStock ?? true,
    isActive:        true,
    lastScrapedAt:   new Date(),
    scrapedAt:       scraped.scrapedAt ? new Date(scraped.scrapedAt) : new Date(),
  };
}

async function seed() {
  const args = process.argv.slice(2);
  const shouldClear = args.includes("--clear");
  const dynamic = args.includes("--all");
  const queryArg = args.find((a) => !a.startsWith("--"));
  const queries = queryArg ? [queryArg] : DEFAULT_QUERIES;

  console.log("ShopSavvy Seed Script");
  console.log("=====================");
  console.log(`Queries   : ${queries.join(", ")}`);
  console.log(`Mode      : ${dynamic ? "fixed + dynamic" : "fixed scrapers only"}`);
  console.log(`Clear DB  : ${shouldClear}`);
  console.log("");

  await connectDB();

  if (shouldClear) {
    const deleted = await Listing.deleteMany({});
    await PriceHistory.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing listings and price history\n`);
  }

  let totalSaved = 0;
  let totalSkipped = 0;
  let totalPriceRecords = 0;

  for (const query of queries) {
    console.log(`\n--- Scraping: "${query}" ---`);

    let scraped;
    try {
      scraped = await scrapeAllPlatforms(query, { dynamic });
    } catch (err) {
      console.error(`Scraping failed for "${query}":`, err.message);
      continue;
    }

    if (scraped.length === 0) {
      console.log(`No results found for "${query}"`);
      continue;
    }

    let saved = 0;
    let skipped = 0;
    let priceRecords = 0;

    for (const item of scraped) {
      if (!item.price) {
        skipped++;
        continue;
      }

      try {
        // Upsert the listing
        await Listing.findOneAndUpdate(
          { platform: item.platform, sourceUrl: item.sourceUrl },
          { $set: toListingDoc(item) },
          { upsert: true, returnDocument: "after" }
        );
        saved++;

        // Record price history
        await PriceHistory.recordPrice(item);
        priceRecords++;
      } catch (err) {
        console.warn(`Failed to save "${item.title}":`, err.message);
        skipped++;
      }
    }

    console.log(`"${query}" → saved ${saved} listings, ${priceRecords} price records, skipped ${skipped}`);
    totalSaved += saved;
    totalSkipped += skipped;
    totalPriceRecords += priceRecords;
  }

  console.log("\n=====================");
  console.log(`Done! Listings: ${totalSaved} saved, ${totalSkipped} skipped`);
  console.log(`Price history: ${totalPriceRecords} records written`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});