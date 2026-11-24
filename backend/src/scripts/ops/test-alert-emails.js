// test-alert-emails.js — check that price-alert emails arrive, and how they look, without waiting for a real price drop (2026-11-24).
//
//   node src/scripts/ops/test-alert-emails.js you@example.com
//       Preview: sends both designed emails (the confirmation and "price reached") to that address for a real product, at its real
//       price. Writes nothing; the links in these two emails are for show (no alert stands behind them).
//
//   node src/scripts/ops/test-alert-emails.js you@example.com --reach
//       End to end, for an alert you made on the site and confirmed by email: sets that address's active alerts' target to the
//       product's price today, then runs the real alert check once. The real "price reached" email arrives, sent exactly as a real
//       drop would send it, and the alert is marked reached. Only that address's own alerts are touched.
//
// Needs SMTP settings in backend/.env (as send-test-email.js does); without them the emails are printed here instead.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import Listing from "../../models/listing.model.js";
import PriceAlert from "../../models/priceAlert.model.js";
import { alertLinks, checkAlerts } from "../../services/priceAlert.service.js";
import { notifyAlert, sendAlertConfirmation } from "../../services/notification.service.js";

const email = process.argv[2];
const reach = process.argv.includes("--reach");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node src/scripts/ops/test-alert-emails.js you@example.com [--reach]");
  process.exit(2);
}

await mongoose.connect(process.env.MONGO_URI);
try {
  if (reach) {
    const alerts = await PriceAlert.find({ email: email.toLowerCase(), status: "active" });
    if (alerts.length === 0) {
      console.log(`No confirmed (active) alert for ${email}. Make one on a product page, click "Confirm my alert" in its email, then run this again.`);
    } else {
      for (const alert of alerts) {
        const listing = await Listing.findById(alert.listing).select("price title").lean();
        if (!listing) continue;
        alert.targetPrice = listing.price; // the price today, so the check finds it reached
        await alert.save();
        console.log(`Alert on "${listing.title}": target set to today's price, PKR ${listing.price}.`);
      }
      const result = await checkAlerts();
      console.log(`Alert check: ${result.checked} checked, ${result.triggered} reached. Look in ${email}'s inbox (and spam).`);
    }
  } else {
    const listing = await Listing.findOne({ platform: "priceoye", productCategory: "smartphone", isActive: true, price: { $gt: 0 } })
      .sort({ lastScrapedAt: -1 }).select("title price platform productUrl").lean();
    const alert = { email, title: listing.title, targetPrice: Math.round(listing.price * 0.95) };
    const links = alertLinks(new mongoose.Types.ObjectId());
    const one = await sendAlertConfirmation(alert, links);
    const two = await notifyAlert(alert, { ...listing, price: alert.targetPrice - 1 }, links);
    console.log(`Confirmation: ${one.delivered ? "sent" : `not sent (${one.channel}${one.reason ? `, ${one.reason}` : ""})`}`);
    console.log(`Price reached: ${two.delivered ? "sent" : `not sent (${two.channel}${two.reason ? `, ${two.reason}` : ""})`}`);
    console.log(`Look in ${email}'s inbox (and spam) for two emails about "${listing.title}". Their links are for show only.`);
  }
} finally {
  await mongoose.disconnect();
}
