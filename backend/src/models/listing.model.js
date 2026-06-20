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
      required: true,
    },

    productUrl: {
      type: String,
      default: "",
    },

    imageUrl: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Listing = mongoose.model("Listing", listingSchema);

export default Listing;