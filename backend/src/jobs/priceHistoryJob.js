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
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runScheduledScrape } from "../services/scheduledScraping.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", "..", ".scheduled-scrape-state.json");

const WINDOW_START_HOUR = 22; // 10 PM, inclusive
const WINDOW_END_HOUR = 23; // 11 PM, exclusive
const CHECK_INTERVAL_CRON = "*/10 * * * *"; // every 10 minutes

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastRunDate: null };
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isWithinWindow() {
  const hour = new Date().getHours();
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

let isRunning = false;

async function maybeRunToday() {
  if (isRunning) return; // a run is already in flight, don't double-start

  const today = todayKey();
  if (readState().lastRunDate === today) return; // already done today
  if (!isWithinWindow()) return; // not the window right now

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
    writeState({ lastRunDate: today });

    console.log(
      `[priceHistoryJob] Done. ${summary.totalQueries} queries, ${summary.totalSaved} listings saved, ` +
      `${summary.failures.length} failed, ${(summary.durationMs / 1000).toFixed(0)}s.`
    );
  } catch (err) {
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
