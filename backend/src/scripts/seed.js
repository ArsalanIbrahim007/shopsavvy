// seed.js
// Runs all fixed scrapers for a list of search queries and saves
// results into MongoDB. Run this manually to populate the database
// with fresh product listings.
//
// Usage:
//   node src/scripts/seed.js                    — seeds default queries
//   node src/scripts/seed.js "samsung galaxy"   — seeds a specific query
//
// Options:
//   --clear    Wipe existing listings before seeding (fresh start)
//   --all      Also run Google discovery layer (uses SerpApi + Groq quota)

import { config } from "dotenv";
config(); // loads backend/.env (run from backend/ directory)

import { connectDB } from "../config/db.js";
import Listing from "../models/listing.model.js";
import { scrapeAllPlatforms } from "../scrapers/index.js";

// Default queries to seed if none provided via CLI
const DEFAULT_QUERIES = [
  "iphone 15",
  "samsung galaxy s24",
  "macbook air",
  "dell laptop",
  "playstation 5",
];

/**
 * Converts a ScrapedListing (scraper output) to a Listing model document.
 * Maps scraper field names to model field names where they differ.
 */
function toListingDoc(scraped) {
  return {
    platform:      scraped.platform,
    title:         scraped.title,
    price:         scraped.price,
    originalPrice: scraped.originalPrice ?? null,
    sourceUrl:     scraped.sourceUrl,
    productUrl:    scraped.sourceUrl,   // keep both in sync
    imageUrl:      scraped.imageUrl ?? "",
    brand:         scraped.brand ?? null,
    inStock:       scraped.inStock ?? true,
    scrapedAt:     scraped.scrapedAt ? new Date(scraped.scrapedAt) : new Date(),
    category:      "",                  // filled in later by normalization layer
  };
}

async function seed() {
  // Parse CLI args
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

  // Connect to MongoDB
  await connectDB();

  // Optionally clear existing listings
  if (shouldClear) {
    const deleted = await Listing.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing listings\n`);
  }

  let totalSaved = 0;
  let totalSkipped = 0;

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

    // Upsert each listing — if same platform+sourceUrl already exists,
    // update it instead of creating a duplicate
    let saved = 0;
    let skipped = 0;

    for (const item of scraped) {
      // Skip listings with no price — not useful for comparison
      if (!item.price) {
        skipped++;
        continue;
      }

      try {
        await Listing.findOneAndUpdate(
          { platform: item.platform, sourceUrl: item.sourceUrl },
          { $set: toListingDoc(item) },
          { upsert: true, returnDocument: "after" }
        );
        saved++;
      } catch (err) {
        console.warn(`Failed to save "${item.title}":`, err.message);
        skipped++;
      }
    }

    console.log(`"${query}" → saved ${saved}, skipped ${skipped} (no price or error)`);
    totalSaved += saved;
    totalSkipped += skipped;
  }

  console.log("\n=====================");
  console.log(`Done! Total saved: ${totalSaved}, skipped: ${totalSkipped}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});