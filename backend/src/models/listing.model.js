import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Arsalan's field — normalized for matching/grouping
    normalizedTitle: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    price: {
      type: Number,
      default: null,
      min: 0,
    },
    // Muzammil's field — pre-discount price for fake discount detection
    originalPrice: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: "PKR",
      trim: true,
    },
    // Muzammil's field — direct scraper URL (more specific than productUrl)
    sourceUrl: {
      type: String,
      default: "",
      trim: true,
    },
    productUrl: {
      type: String,
      default: "",
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    // Muzammil's field — extracted from scraper
    brand: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: "Electronics",
      trim: true,
    },
    // Muzammil's field — stock status from scraper
    inStock: {
      type: Boolean,
      default: true,
    },
    // Arsalan's field
    isActive: {
      type: Boolean,
      default: true,
    },
    lastScrapedAt: {
      type: Date,
      default: Date.now,
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Arsalan's indexes for grouping/matching
listingSchema.index({ platform: 1, title: 1 });
listingSchema.index({ normalizedTitle: 1 });
listingSchema.index({ price: 1 });

const Listing = mongoose.model("Listing", listingSchema);
export default Listing;