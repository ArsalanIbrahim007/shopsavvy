// run-scheduled-scrape.js — runs the scheduled re-scrape once, immediately,
// without waiting for the cron trigger. Use this to manually build up price
// history in the days before a demo, or to test the job's behavior.
//
//   node src/scripts/run-scheduled-scrape.js
//   node src/scripts/run-scheduled-scrape.js --min-offers=1   (include single-offer groups too)

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { buildScheduledQueryList, runScheduledScrape } from "../services/scheduledScraping.service.js";

const minOffersArg = process.argv.find((a) => a.startsWith("--min-offers="));
const minOffers = minOffersArg ? Number(minOffersArg.split("=")[1]) : 2;

await mongoose.connect(process.env.MONGO_URI);

const queries = await buildScheduledQueryList({ minOffers });
console.log(`${queries.length} queries to re-scrape (min ${minOffers} offer(s) per product).\n`);

const summary = await runScheduledScrape({
  queries,
  onProgress: ({ index, total, query, saved, error }) => {
    if (error) console.warn(`(${index}/${total}) "${query}" failed: ${error}`);
    else console.log(`(${index}/${total}) "${query}" -> ${saved} saved`);
  },
});

console.log(`\nDone. ${summary.totalQueries} queries, ${summary.totalSaved} listings saved, ${summary.failures.length} failed, ${(summary.durationMs / 1000).toFixed(0)}s.`);

await mongoose.disconnect();
