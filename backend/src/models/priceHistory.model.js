// priceHistory.model.js
// Tracks price changes over time for each product on each platform.
//
// Every time a product is scraped, a new price entry is recorded here.
// This gives us the data needed to:
//   1. Show price trend graphs on the frontend
//   2. Detect fake discounts (was the "original price" ever real?)
//   3. Alert users when a price drops
//
// Design decision: separate collection (not embedded in Listing) so that:
//   - Price history can grow indefinitely without bloating the listing doc
//   - We can query history across all platforms for one product
//   - Easier to aggregate and chart

import mongoose from "mongoose";

// A single price snapshot — one entry per scrape per product
const priceEntrySchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // no separate _id per entry, saves space
);

const priceHistorySchema = new mongoose.Schema(
  {
    // Which platform this history belongs to
    platform: {
      type: String,
      required: true,
    },

    // Direct link to the product page — unique identifier per product per platform
    sourceUrl: {
      type: String,
      required: true,
    },

    // Product title (denormalized for easy display without joining Listing)
    title: {
      type: String,
      required: true,
    },

    // Array of price snapshots, oldest first
    // Each entry is recorded when the scraper runs
    entries: [priceEntrySchema],

    // Convenience fields — kept in sync with latest entry for fast queries
    currentPrice: {
      type: Number,
      default: null,
    },
    lowestPrice: {
      type: Number,
      default: null,
    },
    highestPrice: {
      type: Number,
      default: null,
    },

    // Last time this product was scraped
    lastScrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup by platform + URL (the primary key for a product listing)
priceHistorySchema.index({ platform: 1, sourceUrl: 1 }, { unique: true });
// For querying all history of a product across platforms by title
priceHistorySchema.index({ title: "text" });

/**
 * Records a new price entry for a product.
 * Creates the history document if it doesn't exist yet.
 * Updates currentPrice, lowestPrice, highestPrice automatically.
 *
 * @param {object} listing - a ScrapedListing object from the scraper
 * @returns {Promise<PriceHistory>}
 */
priceHistorySchema.statics.recordPrice = async function (listing) {
  const { platform, sourceUrl, title, price, originalPrice, inStock } = listing;

  if (!price) return null; // don't record null prices

  const newEntry = {
    price,
    originalPrice: originalPrice ?? null,
    inStock: inStock ?? true,
    recordedAt: new Date(),
  };

  // Find existing history doc or create new one
  const existing = await this.findOne({ platform, sourceUrl });

  if (!existing) {
    // First time seeing this product — create history doc
    return this.create({
      platform,
      sourceUrl,
      title,
      entries: [newEntry],
      currentPrice: price,
      lowestPrice: price,
      highestPrice: price,
      lastScrapedAt: new Date(),
    });
  }

  // Only add a new entry if price has changed since last record
  // (avoids storing duplicate entries when price stays the same)
  const lastEntry = existing.entries[existing.entries.length - 1];
  const priceChanged = !lastEntry || lastEntry.price !== price;

  if (priceChanged) {
    existing.entries.push(newEntry);
  }

  // Always update convenience fields and timestamp
  existing.currentPrice = price;
  existing.lowestPrice = Math.min(existing.lowestPrice ?? price, price);
  existing.highestPrice = Math.max(existing.highestPrice ?? price, price);
  existing.lastScrapedAt = new Date();
  existing.title = title; // update title in case it changed

  return existing.save();
};

const PriceHistory = mongoose.model("PriceHistory", priceHistorySchema);

export default PriceHistory;