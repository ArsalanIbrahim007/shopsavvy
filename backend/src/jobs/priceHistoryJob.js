// priceHistoryJob.js — schedules the daily re-scrape that builds up real
// price history over time (the prerequisite Phase 4 item: discount
// verification, Isolation Forest anomaly detection, price alerts, and the
// price history chart all need genuine historical depth to be meaningful).
//
// NOT started automatically by `npm run dev` / `npm start` -- gated behind
// SCHEDULED_SCRAPING=true in .env. Without that, running the backend
// locally (which every team member does throughout the day) would silently
// kick off ~90 live scrape requests against four external sites in the
// background, which nobody expects from starting a dev server and risks
// getting the scrapers rate-limited during actual development. Enable it
// explicitly on whichever machine is meant to accumulate history (e.g. in
// the days leading up to a demo), or run once manually:
//   node src/scripts/run-scheduled-scrape.js

import cron from "node-cron";
import { runScheduledScrape } from "../services/scheduledScraping.service.js";

// 02:17 local time -- an off-the-hour minute so this doesn't line up with
// every other cron job that defaults to a round number, and outside normal
// working/demo hours so a ~5 minute scraping burst doesn't compete with
// anyone actively using the app.
const SCHEDULE = "17 2 * * *";

export function startPriceHistoryJob() {
  if (process.env.SCHEDULED_SCRAPING !== "true") {
    console.log("[priceHistoryJob] Disabled (set SCHEDULED_SCRAPING=true in .env to enable)");
    return null;
  }

  console.log(`[priceHistoryJob] Scheduled: "${SCHEDULE}" (daily, 02:17 local time)`);

  return cron.schedule(SCHEDULE, async () => {
    console.log("[priceHistoryJob] Starting scheduled re-scrape...");

    const summary = await runScheduledScrape({
      onProgress: ({ index, total, query, saved, error }) => {
        if (error) console.warn(`[priceHistoryJob] (${index}/${total}) "${query}" failed: ${error}`);
        else console.log(`[priceHistoryJob] (${index}/${total}) "${query}" -> ${saved} saved`);
      },
    });

    console.log(
      `[priceHistoryJob] Done. ${summary.totalQueries} queries, ${summary.totalSaved} listings saved, ` +
      `${summary.failures.length} failed, ${(summary.durationMs / 1000).toFixed(0)}s.`
    );
  });
}
