// groupingWorker.js — the worker-thread side of grouping (see grouping.service.js).
//
// Runs the CPU-heavy pairwise grouping off the main thread so the API keeps
// answering while a broad search is being grouped. It imports only pure code,
// never the database.
//
// Messages in:  { id, type, payload }      Messages out: { id, ok, result | error }
//   "group"  payload { listings, strategy, recommend } -> grouped products (groupingJob.service.js)
//   "deals"  payload { listings, options }             -> ranked top-deal groups (dealsRanking.service.js)

import { parentPort } from "node:worker_threads";

import { groupAndRecommend } from "../services/groupingJob.service.js";
import { computeCategoryDeals } from "../services/dealsRanking.service.js";

const JOBS = {
  group: ({ listings, strategy, recommend }) => groupAndRecommend(listings, { strategy, recommend }),
  deals: ({ listings, options }) => computeCategoryDeals(listings, options),
};

parentPort.on("message", ({ id, type, payload }) => {
  try {
    const job = JOBS[type];
    if (!job) throw new Error(`Unknown job type "${type}"`);
    parentPort.postMessage({ id, ok: true, result: job(payload) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
});
