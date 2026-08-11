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
    // Arsalan's field — platform-specific product ID
    platformProductId: {
      type: String,
      default: "",
      trim: true,
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
      min: 0,
    },
    currency: {
      type: String,
      default: "PKR",
      trim: true,
      uppercase: true,
    },
    // Muzammil's field — direct scraper URL
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
    // Structured attributes derived from the title at collection time.
    // Stored rather than computed on demand so that the database can be
    // filtered by category and queried for the variants it holds.
    productCategory: { type: String, default: "other", index: true },
    storageGb:       { type: Number, default: null, index: true },
    ramGb:           { type: Number, default: null },
    colour:          { type: String, default: null },
    ptaStatus:       { type: String, default: "unknown", index: true },
    condition:       { type: String, default: "new", index: true },
    screenInches:    { type: Number, default: null },
    resolution: { type: String, default: null, index: true },
  },
  {
    timestamps: true,
  }
);

// Indexes for grouping/matching/sorting
listingSchema.index({ platform: 1, title: 1 });
listingSchema.index({ platform: 1, platformProductId: 1 });
listingSchema.index({ normalizedTitle: 1 });
listingSchema.index({ price: 1 });

const Listing = mongoose.model("Listing", listingSchema);
export default Listing;