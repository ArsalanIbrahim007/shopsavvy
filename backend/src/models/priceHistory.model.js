// priceHistory.model.js
// Tracks price changes over time for each product on each platform.
//
// Combines Muzammil's entries-array approach (for trend graphs + fake discount
// detection) with Arsalan's listing reference and source tracking.

import mongoose from "mongoose";

// A single price snapshot — one entry per scrape per product
const priceEntrySchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
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
  { _id: false }
);

const priceHistorySchema = new mongoose.Schema(
  {
    // Arsalan's field — reference to the Listing document
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      default: null,
      index: true,
    },

    platform: {
      type: String,
      required: true,
      trim: true,
    },

    // Arsalan's field — platform-specific product ID
    platformProductId: {
      type: String,
      default: "",
      trim: true,
    },

    // Muzammil's field — direct product page URL
    sourceUrl: {
      type: String,
      required: true,
    },

    // Product title (denormalized for easy display)
    title: {
      type: String,
      required: true,
    },

    currency: {
      type: String,
      default: "PKR",
      trim: true,
      uppercase: true,
    },

    // Arsalan's field — how this record was created
    source: {
      type: String,
      enum: ["listing_created", "scraper", "manual", "listing_updated"],
      default: "scraper",
    },

    // Muzammil's fields — array of price snapshots over time
    entries: [priceEntrySchema],

    // Convenience fields for fast queries
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

    lastScrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
priceHistorySchema.index({ platform: 1, sourceUrl: 1 }, { unique: true });
priceHistorySchema.index({ listing: 1, lastScrapedAt: -1 });
priceHistorySchema.index({ platform: 1, platformProductId: 1, lastScrapedAt: -1 });
priceHistorySchema.index({ title: "text" });

// Pakistan Standard Time is UTC+5 with no daylight saving, so a fixed offset
// gives the calendar day a shopper in Pakistan would call "today".
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function pktDay(date) {
  return new Date(new Date(date).getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Decides whether a scrape should add a new entry to a listing's history.
 *
 * An entry is added when the price or the claimed original price changed, or
 * when the last entry was recorded on an earlier calendar day. The daily
 * entry matters: recording only on change meant a product whose price never
 * moved kept a single entry forever, so no history ever accumulated and the
 * trend and fake-discount checks had nothing to work with. Repeat scrapes
 * within one day still add nothing, so a busy day does not flood the array.
 */
export function shouldAppendEntry(lastEntry, next) {
  if (!lastEntry) return true;
  if (lastEntry.price !== next.price) return true;
  if ((lastEntry.originalPrice ?? null) !== (next.originalPrice ?? null)) return true;
  return pktDay(lastEntry.recordedAt) !== pktDay(next.recordedAt);
}

/**
 * Records a new price entry for a product.
 * Creates the history document if it doesn't exist yet.
 * Updates currentPrice, lowestPrice, highestPrice automatically.
 */
priceHistorySchema.statics.recordPrice = async function (listing) {
  const { platform, sourceUrl, title, price, originalPrice, inStock } = listing;

  if (!price) return null;

  const newEntry = {
    price,
    originalPrice: originalPrice ?? null,
    inStock: inStock ?? true,
    recordedAt: new Date(),
  };

  const existing = await this.findOne({ platform, sourceUrl });

  if (!existing) {
    return this.create({
      platform,
      sourceUrl,
      title,
      entries: [newEntry],
      currentPrice: price,
      lowestPrice: price,
      highestPrice: price,
      lastScrapedAt: new Date(),
      source: "scraper",
    });
  }

  const lastEntry = existing.entries[existing.entries.length - 1];

  if (shouldAppendEntry(lastEntry, newEntry)) {
    existing.entries.push(newEntry);
  }

  existing.currentPrice = price;
  existing.lowestPrice = Math.min(existing.lowestPrice ?? price, price);
  existing.highestPrice = Math.max(existing.highestPrice ?? price, price);
  existing.lastScrapedAt = new Date();
  existing.title = title;

  return existing.save();
};

const PriceHistory = mongoose.model("PriceHistory", priceHistorySchema);
export default PriceHistory; 