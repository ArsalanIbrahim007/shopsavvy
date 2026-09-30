// alertCheckJob.js — periodically checks active price alerts against
// current listing prices. Unlike priceHistoryJob.js, this makes no
// external requests (it only reads prices already in the local database,
// however they got there -- a live user search, or the scheduled scrape),
// so it isn't gated behind an env flag or a time window; it just runs
// whenever the backend is up.

import cron from "node-cron";
import { checkAlerts } from "../services/priceAlert.service.js";

const CHECK_INTERVAL_CRON = "*/15 * * * *"; // every 15 minutes

export function startAlertCheckJob() {
  console.log("[alertCheckJob] Checking active price alerts every 15 minutes");

  // Returned so a shutdown can stop it.
  return cron.schedule(CHECK_INTERVAL_CRON, async () => {
    try {
      const { checked, triggered } = await checkAlerts();
      if (triggered > 0) {
        console.log(`[alertCheckJob] Checked ${checked} active alerts, ${triggered} triggered.`);
      }
    } catch (err) {
      console.error("[alertCheckJob] Check failed:", err.message);
    }
  });
}
