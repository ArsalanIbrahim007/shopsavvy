import mongoose from "mongoose";

const priceHistorySchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    platform: {
      type: String,
      required: true,
      trim: true,
    },

    platformProductId: {
      type: String,
      default: "",
      trim: true,
    },

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

    currency: {
      type: String,
      default: "PKR",
      trim: true,
      uppercase: true,
    },

    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    source: {
      type: String,
      enum: ["listing_created", "scraper", "manual", "listing_updated"],
      default: "manual",
    },
  },
  {
    timestamps: true,
  }
);

priceHistorySchema.index({
  listing: 1,
  recordedAt: -1,
});

priceHistorySchema.index({
  platform: 1,
  platformProductId: 1,
  recordedAt: -1,
});

const PriceHistory = mongoose.model(
  "PriceHistory",
  priceHistorySchema
);

export default PriceHistory;
