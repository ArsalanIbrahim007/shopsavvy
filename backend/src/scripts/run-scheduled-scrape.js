// run-scheduled-scrape.js — runs the scheduled re-scrape once, immediately,
// without waiting for the backend's 10-11 PM window. Use this to build up price
// history by hand, to catch up a day the backend was not running, or as the
// action of a Windows Task Scheduler task (see ops/register-nightly-scrape.ps1),
// which is how the daily scrape survives a laptop that was asleep at 10 PM.
//
//   node src/scripts/run-scheduled-scrape.js
//   node src/scripts/run-scheduled-scrape.js --min-offers=1   (include single-offer groups too)
//   node src/scripts/run-scheduled-scrape.js --force          (run even if today's scrape already happened)
//   node src/scripts/run-scheduled-scrape.js --no-pages         (skip the page check (PTA status, colours) that follows the scrape)
//
// Shares today's "already done / running" record with the backend's own daily job
// (src/jobs/scrapeState.js), so a day is scraped once however it was started:
// without --force, this exits quietly (code 0) when today has run or is running.
// A scrape that fails exits with code 1, and the day is not marked done.

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { isDoneToday, markDone, markFailed, tryStart } from "../jobs/scrapeState.js";
import { enrichFromPages } from "../services/pageEnrichment.service.js";
import { buildScheduledQueryList, runScheduledScrape } from "../services/scheduledScraping.service.js";

const minOffersArg = process.argv.find((a) => a.startsWith("--min-offers="));
const minOffers = minOffersArg ? Number(minOffersArg.split("=")[1]) : 2;
const force = process.argv.includes("--force");

// Every line of nightly-scrape.log starts a run with a time, so a run that is stopped can be told from one that never started.
const stamp = () => new Date().toISOString();
console.log(`[${stamp()}] scheduled scrape starting`);

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

// A window closed or Ctrl+C: say so in the log and release today's claim, so the next start is not told "already running".
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => {
    console.warn(`[${stamp()}] stopped by ${signal} before it finished`);
    if (claimed) markFailed();
    process.exit(1);
  });
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

  // Then read a few store pages for PTA status and colours. The scrape is already recorded as done, so a failure here only
  // shows in the log.
  if (!process.argv.includes("--no-pages")) {
    try {
      const pages = await enrichFromPages({ log: console.log });
      console.log(`Page check: ${pages.checked} pages read, PTA ${pages.approved} approved / ${pages.nonPta} non-PTA, ${pages.withColours} with colours, ${pages.failed} unreadable.`);
    } catch (err) {
      console.warn("Page check failed:", err.message);
    }
  }
} catch (err) {
  if (claimed) markFailed();
  console.error("Scheduled scrape failed:", err.message);
  exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
console.log(`[${stamp()}] scheduled scrape finished with exit code ${exitCode}`);
process.exit(exitCode);
