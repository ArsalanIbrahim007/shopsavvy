import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      default: null,
    },

    originalPrice: {
      type: Number,
      default: null,
    },

    // URL to the product page on the source platform
    sourceUrl: {
      type: String,
      default: "",
    },

    // Keep productUrl as alias for backward compatibility
    productUrl: {
      type: String,
      default: "",
    },

    imageUrl: {
      type: String,
      default: "",
    },

    brand: {
      type: String,
      default: null,
    },

    category: {
      type: String,
      default: "",
    },

    inStock: {
      type: Boolean,
      default: true,
    },

    // When this listing was scraped (from scraper output)
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// Index for fast lookups by platform and title
listingSchema.index({ platform: 1, title: 1 });
// Index for price-based sorting/filtering
listingSchema.index({ price: 1 });

const Listing = mongoose.model("Listing", listingSchema);

export default Listing;