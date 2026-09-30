// dealsWorker.js — runs the deals computation off the main thread.
//
// Grouping listings compares them pairwise, which takes seconds of pure CPU for a
// category of a thousand listings. On the main thread that freezes every request
// for as long as it runs (the product page once took over a minute this way and
// even /api/health timed out). A worker thread does the work while the API stays
// responsive.
//
// It imports only the pure ranking code, never the database.

import { parentPort, workerData } from "node:worker_threads";
import { computeCategoryDeals } from "../services/dealsRanking.service.js";

try {
  parentPort.postMessage({ ok: true, deals: computeCategoryDeals(workerData.listings, workerData.options) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
