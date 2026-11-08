// run-catalogue-refresh.js — refreshes the prices we hold from whole store catalogues (services/catalogueRefresh.service.js).
//
//   node src/scripts/run-catalogue-refresh.js                     every catalogue store, one after another
//   node src/scripts/run-catalogue-refresh.js --store=alfamall    one store (repeatable: --store=a --store=b)
//   node src/scripts/run-catalogue-refresh.js --dry-run           count what would be updated, write nothing
//
// The nightly scrape runs it before its searches (run-scheduled-scrape.js). Prints one line per store: how many products the
// catalogue had, how many of them we hold, how many were updated, and how long it took.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { CATALOGUE_STORES, refreshCatalogue } from "../services/catalogueRefresh.service.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => a.startsWith("--store=")).map((a) => a.slice("--store=".length));
const stores = only.length ? CATALOGUE_STORES.filter((s) => only.includes(s.platform)) : CATALOGUE_STORES;
if (only.length && stores.length !== only.length) {
  console.error(`Unknown store. Catalogue stores: ${CATALOGUE_STORES.map((s) => s.platform).join(", ")}`);
  process.exit(2);
}

await mongoose.connect(process.env.MONGO_URI);
let failed = 0;
try {
  for (const store of stores) {
    try {
      const s = await refreshCatalogue(store, { dryRun });
      console.log(
        `[catalogue] ${s.platform.padEnd(18)} ${String(s.items).padStart(6)} in catalogue, ${String(s.matched).padStart(6)} of our ${String(s.known).padStart(6)} found, ` +
          `${String(s.updated).padStart(6)} ${dryRun ? "would be updated" : "updated"}${s.gone ? `, ${s.gone} no longer sold` : ""} (${s.pages} pages${s.terms ? `, ${s.terms} brands` : ""}, ${Math.round(s.durationMs / 1000)} s)`,
      );
    } catch (error) {
      failed += 1;
      console.error(`[catalogue] ${store.platform}: ${error.message}`);
    }
  }
} finally {
  await mongoose.disconnect();
}
process.exit(failed ? 1 : 0);
