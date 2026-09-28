// priceAlert.model.js — FR-19 from the SRS ("notify a user when a tracked
// product falls below a chosen price"), marked "Low, future" because it
// depended on scheduled scraping existing first (prices need to actually
// change on their own for an alert to ever fire). That's done now.
//
// No user accounts exist in this system by design (anonymous public use),
// so this is accountless: an alert is just an email address plus a target
// price, the same pattern a "notify me when back in stock" button uses on
// a site with no login. There's no way to verify the email actually
// belongs to the requester at this stage -- see notification.service.js
// for what that means for delivery.

import mongoose from "mongoose";

const priceAlertSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    // Denormalized so an alert is still readable/displayable even if the
    // listing it points to is later removed (e.g. a scraper stops covering
    // that platform).
    title: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    targetPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    priceAtCreation: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "triggered", "cancelled"],
      default: "active",
      index: true,
    },

    triggeredAt: {
      type: Date,
      default: null,
    },

    triggeredPrice: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// The hot path for the alert-check job: "every active alert for a given
// listing". Compound so it can serve that without a collection scan even
// as the alert count grows.
priceAlertSchema.index({ listing: 1, status: 1 });

const PriceAlert = mongoose.model("PriceAlert", priceAlertSchema);
export default PriceAlert;
