// run-scheduled-scrape.js — runs the scheduled re-scrape once, immediately,
// without waiting for the backend's 10-11 PM window. Use this to build up price
// history by hand, to catch up a day the backend was not running, or as the
// action of a Windows Task Scheduler task (see ops/register-nightly-scrape.ps1),
// which is how the daily scrape survives a laptop that was asleep at 10 PM.
//
//   node src/scripts/run-scheduled-scrape.js
//   node src/scripts/run-scheduled-scrape.js --min-offers=1   (include single-offer groups too)
//   node src/scripts/run-scheduled-scrape.js --force          (run even if today's scrape already happened)
//   node src/scripts/run-scheduled-scrape.js --no-pta         (skip the PTA page check that follows the scrape)
//
// Shares today's "already done / running" record with the backend's own daily job
// (src/jobs/scrapeState.js), so a day is scraped once however it was started:
// without --force, this exits quietly (code 0) when today has run or is running.
// A scrape that fails exits with code 1, and the day is not marked done.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { isDoneToday, markDone, markFailed, tryStart } from "../jobs/scrapeState.js";
import { enrichPta } from "../services/ptaEnrichment.service.js";
import { buildScheduledQueryList, runScheduledScrape } from "../services/scheduledScraping.service.js";

const minOffersArg = process.argv.find((a) => a.startsWith("--min-offers="));
const minOffers = minOffersArg ? Number(minOffersArg.split("=")[1]) : 2;
const force = process.argv.includes("--force");

let claimed = false;
if (!force) {
  const claim = tryStart();
  if (!claim.ok) {
    console.log(claim.reason === "done-today"
      ? "Today's scheduled scrape has already run. Nothing to do (use --force to run anyway)."
      : "Today's scheduled scrape is already running in another process. Nothing to do.");
    process.exit(0);
  }
  claimed = true;
}

let exitCode = 0;
try {
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

  if (claimed || !isDoneToday()) markDone();
  console.log(`\nDone. ${summary.totalQueries} queries, ${summary.totalSaved} listings saved, ${summary.failures.length} failed, ${(summary.durationMs / 1000).toFixed(0)}s.`);

  // Then read a few store pages for PTA status. The scrape is already recorded as done, so a failure here only
  // shows in the log.
  if (!process.argv.includes("--no-pta")) {
    try {
      const pta = await enrichPta({ log: console.log });
      console.log(`PTA check: ${pta.checked} pages read, ${pta.approved} approved, ${pta.nonPta} non-PTA, ${pta.unknown} say nothing, ${pta.failed} unreadable.`);
    } catch (err) {
      console.warn("PTA check failed:", err.message);
    }
  }
} catch (err) {
  if (claimed) markFailed();
  console.error("Scheduled scrape failed:", err.message);
  exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
process.exit(exitCode);
