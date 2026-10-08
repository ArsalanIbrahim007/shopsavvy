// enrich-pages.js — reads the store's own product page for phones, tablets, watches, headphones and laptops and records
// what it says that the title does not: PTA status (phones and tablets), the colours the product comes in and, for stores whose
// pages state one per product, the rating (see src/services/pageEnrichment.service.js).
//
//   node src/scripts/maintenance/enrich-pages.js --dry                read 150 pages and report; saves nothing
//   node src/scripts/maintenance/enrich-pages.js                      read 150 pages and save what they say
//   node src/scripts/maintenance/enrich-pages.js --limit=300 --store=priceoye --store=mega
//   node src/scripts/maintenance/enrich-pages.js --again --store=priceoye --limit=100   read pages again even if read lately
//
// Options: --limit=N (default 150), --store=ID (repeatable), --match=TEXT (only titles containing it, e.g. --match=iphone),
// --delay=MS between pages (default 2500), --dry, --again (also pages read within the last 14 days, oldest first: to fill in a
// new field, such as ratings, without waiting for each page to come due).
// It is also run after the nightly scrape (src/scripts/run-scheduled-scrape.js) with the default limit.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { enrichFromPages, DEFAULT_LIMIT } from "../../services/pageEnrichment.service.js";

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const limit = Number(arg("limit")[0] ?? DEFAULT_LIMIT);
const delayMs = Number(arg("delay")[0] ?? 2500);
const stores = arg("store").map((s) => s.toLowerCase());
const match = arg("match")[0] ?? null;
const dry = process.argv.includes("--dry");
const again = process.argv.includes("--again");

await mongoose.connect(process.env.MONGO_URI);
try {
  const summary = await enrichFromPages({ limit, delayMs, stores, match, dry, again, log: console.log });
  console.log(`\n${dry ? "[dry run, nothing saved] " : ""}Read ${summary.checked} pages: PTA ${summary.approved} approved, ${summary.nonPta} non-PTA, ${summary.unknown} say nothing; ${summary.withColours} list colours; ${summary.withRating} state a rating; ${summary.failed} could not be read.`);
} finally {
  await mongoose.disconnect();
  // the headless browser (used for iShopping and Paklap) would otherwise keep the process alive
  process.exit(0);
}
