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

    normalizedTitle: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
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

    category: {
      type: String,
      default: "Electronics",
      trim: true,
    },

    lastScrapedAt: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

listingSchema.index({
  platform: 1,
  platformProductId: 1,
});

const Listing = mongoose.model("Listing", listingSchema);

export default Listing;