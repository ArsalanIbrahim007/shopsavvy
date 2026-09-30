// priceHistoryJob.js — schedules the daily re-scrape that builds up real
// price history over time (the prerequisite Phase 4 item: discount
// verification, Isolation Forest anomaly detection, price alerts, and the
// price history chart all need genuine historical depth to be meaningful).
//
// NOT started automatically by `npm run dev` / `npm start` -- gated behind
// SCHEDULED_SCRAPING=true in .env. Without that, running the backend
// locally (which every team member does throughout the day) would silently
// kick off ~90 live scrape requests against four external sites in the
// background, which nobody expects from starting a dev server. Enable it
// explicitly on whichever machine is meant to accumulate history (e.g. in
// the days leading up to a demo), or run once manually:
//   node src/scripts/run-scheduled-scrape.js
//
// A single fixed cron minute doesn't work well on a laptop that isn't
// always on: if the backend wasn't running at that exact minute, the whole
// day's data point is silently skipped (found this the hard way -- set for
// 22:00, checked at 22:16, already missed). Instead this checks every 10
// minutes whether the current time falls in a 10-11 PM window AND today's
// run hasn't happened yet, and fires as soon as both are true -- so the
// backend just needs to be running for a few minutes anywhere in that hour,
// not at one precise instant.

import cron from "node-cron";
import { enrichPta } from "../services/ptaEnrichment.service.js";
import { runScheduledScrape } from "../services/scheduledScraping.service.js";
import { isDoneToday, markDone, markFailed, pktHour, tryStart } from "./scrapeState.js";

const WINDOW_START_HOUR = 22; // 10 PM Pakistan time, inclusive
const WINDOW_END_HOUR = 23; // 11 PM, exclusive
const CHECK_INTERVAL_CRON = "*/10 * * * *"; // every 10 minutes

// The day and the window are Pakistan's (see scrapeState.js), so they do not depend on this machine's time zone.
// The day is also shared with the script run by hand or by Windows Task Scheduler
// (src/scripts/run-scheduled-scrape.js): whichever starts first does the day's scrape, the other skips it.
export function isWithinWindow(now = new Date()) {
  const hour = pktHour(now);
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

let isRunning = false;

async function maybeRunToday() {
  if (isRunning) return; // a run is already in flight, don't double-start

  if (isDoneToday()) return; // already done today
  if (!isWithinWindow()) return; // not the window right now
  if (!tryStart().ok) return; // the script (or another process) is already doing today's run

  isRunning = true;
  console.log("[priceHistoryJob] In the 10-11 PM window and not yet run today, starting...");

  try {
    const summary = await runScheduledScrape({
      onProgress: ({ index, total, query, saved, error }) => {
        if (error) console.warn(`[priceHistoryJob] (${index}/${total}) "${query}" failed: ${error}`);
        else console.log(`[priceHistoryJob] (${index}/${total}) "${query}" -> ${saved} saved`);
      },
    });

    // Only marked done on success -- a crash partway through leaves
    // lastRunDate unset, so the next 10-minute check retries rather than
    // silently giving up on today, as long as it's still before 11 PM.
    markDone();

    console.log(
      `[priceHistoryJob] Done. ${summary.totalQueries} queries, ${summary.totalSaved} listings saved, ` +
      `${summary.failures.length} failed, ${(summary.durationMs / 1000).toFixed(0)}s.`
    );

    // Then read a few store pages for PTA status (see ptaEnrichment.service.js). The scrape already counts as done:
    // a failure here is logged and never makes the day be scraped twice.
    try {
      const pta = await enrichPta();
      console.log(`[priceHistoryJob] PTA check: ${pta.checked} pages read, ${pta.approved} approved, ${pta.nonPta} non-PTA, ${pta.failed} unreadable.`);
    } catch (err) {
      console.warn("[priceHistoryJob] PTA check failed:", err.message);
    }
  } catch (err) {
    markFailed();
    console.error("[priceHistoryJob] Run failed, will retry on the next check within the window:", err.message);
  } finally {
    isRunning = false;
  }
}

export function startPriceHistoryJob() {
  if (process.env.SCHEDULED_SCRAPING !== "true") {
    console.log("[priceHistoryJob] Disabled (set SCHEDULED_SCRAPING=true in .env to enable)");
    return null;
  }

  console.log("[priceHistoryJob] Window: 10:00-11:00 PM daily, checked every 10 min while the backend is running");

  // Covers the backend already being up when the window starts, or being
  // started mid-window -- without this, starting at 22:23 would wait for
  // the next 10-minute tick instead of checking right away.
  maybeRunToday();

  return cron.schedule(CHECK_INTERVAL_CRON, maybeRunToday);
}
