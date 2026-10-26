// seed.js — empties the end-to-end tests' own database and fills it with fixtures.js, before the API starts (playwright.config.js).
//
// It only ever touches a database whose name ends in "_e2e": a mistyped address must not empty the real catalogue.

import mongoose from "mongoose";

import Listing from "../src/models/listing.model.js";
import PriceHistory from "../src/models/priceHistory.model.js";
import { toListingDoc } from "../src/services/scraper.service.js";
import { E2E_MONGO_URI, ITEMS } from "./fixtures.js";

const name = new URL(E2E_MONGO_URI).pathname.slice(1);
if (!name.endsWith("_e2e")) {
  console.error(`[e2e seed] refusing to empty "${name || "(no database named)"}": its name must end in _e2e`);
  process.exit(1);
}

await mongoose.connect(E2E_MONGO_URI, { serverSelectionTimeoutMS: 10000 });
await mongoose.connection.dropDatabase();
for (const item of ITEMS) {
  await Listing.create(toListingDoc(item)); // as a scrape saves it: checked now, so every search below is "fresh" and asks no store
  await PriceHistory.recordPrice(item);
}
console.log(`[e2e seed] ${name}: ${await Listing.countDocuments()} listings`);
await mongoose.disconnect();
