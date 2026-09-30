// enrich-pta.js — reads the store's own product page for phones and tablets whose title does not say whether they
// are PTA approved, and records what the page says (see src/services/ptaEnrichment.service.js).
//
//   node src/scripts/maintenance/enrich-pta.js --dry                  read 60 pages and report; saves nothing
//   node src/scripts/maintenance/enrich-pta.js                        read 60 pages and save what they say
//   node src/scripts/maintenance/enrich-pta.js --limit=200 --store=priceoye --store=mega
//
// Options: --limit=N (default 60), --store=ID (repeatable), --delay=MS between pages (default 2500), --dry.
// It is also run after the nightly scrape (src/scripts/run-scheduled-scrape.js) with the default limit.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { enrichPta } from "../../services/ptaEnrichment.service.js";

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const limit = Number(arg("limit")[0] ?? 60);
const delayMs = Number(arg("delay")[0] ?? 2500);
const stores = arg("store").map((s) => s.toLowerCase());
const dry = process.argv.includes("--dry");

await mongoose.connect(process.env.MONGO_URI);
try {
  const summary = await enrichPta({ limit, delayMs, stores, dry, log: console.log });
  console.log(`\n${dry ? "[dry run, nothing saved] " : ""}Read ${summary.checked} pages: ${summary.approved} PTA approved, ${summary.nonPta} non-PTA, ${summary.unknown} say nothing; ${summary.failed} could not be read.`);
} finally {
  await mongoose.disconnect();
  // the headless browser (used for iShopping and Paklap) would otherwise keep the process alive
  process.exit(0);
}
