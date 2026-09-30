// grouping.service.js — groups listings into products without blocking the API.
//
// Grouping compares listings pairwise, so its cost grows with the square of their
// number. Measured on the real database: 31 listings 33 ms, 68 listings 105 ms,
// 195 listings 0.73 s, 539 listings 3.6 s, 1,005 listings 14.4 s, and for that
// whole time the main thread cannot answer any other request (not even /api/health).
//
//   small set  (<= OFFLOAD_THRESHOLD listings)  -> computed in-thread; starting a worker
//                                                  would cost more than the job
//   larger set                                   -> computed in a worker thread, the API
//                                                  keeps answering meanwhile
//
// Both paths call the same function (groupingJob.service.js) and return the same result.
// Listings must be plain objects: ids are turned into strings here because a Mongo
// ObjectId does not survive being copied to a worker, so `_id` is a string in both paths.

import { availableParallelism } from "node:os";

import { WorkerPool } from "../workers/workerPool.js";
import { groupAndRecommend } from "./groupingJob.service.js";

// Below ~40 listings grouping takes ~35 ms or less, which is not worth a thread hop.
export const OFFLOAD_THRESHOLD = 40;

const JOB_TIMEOUT_MS = 90 * 1000;

const workerCount = () => {
  const configured = Number(process.env.GROUPING_WORKERS);
  if (Number.isInteger(configured) && configured > 0) return Math.min(configured, 8);
  // Leave a core for the main thread and the database driver.
  return Math.max(1, Math.min(2, availableParallelism() - 1));
};

let pool = null;

/** The shared pool, created on first use. */
export function getGroupingPool() {
  if (!pool) {
    pool = new WorkerPool(new URL("../workers/groupingWorker.js", import.meta.url), {
      size: workerCount(),
      timeoutMs: JOB_TIMEOUT_MS,
      maxQueue: 20,
      name: "grouping worker",
    });
  }
  return pool;
}

/** Starts the workers now so the first heavy search does not pay for start-up. */
export function warmGroupingPool() {
  getGroupingPool().warm();
}

export function groupingPoolStats() {
  return pool ? pool.stats() : { running: 0, queued: 0, workers: 0 };
}

/** Stops the workers; used by tests and scripts. */
export async function closeGroupingPool() {
  if (pool) await pool.close();
  pool = null;
}

const withStringIds = (listings) => listings.map((listing) => ({ ...listing, _id: String(listing._id) }));

/**
 * @param {object[]} listings  plain listing objects
 * @param {object}   [options]
 * @param {"ml"|"rule"} [options.strategy]
 * @param {boolean}  [options.recommend]  attach recommendations to each group (default true)
 * @param {number}   [options.threshold]  listings above this many go to a worker (default OFFLOAD_THRESHOLD)
 * @returns {Promise<object[]>} groups, best-supported first
 */
export async function groupListings(listings = [], { strategy = "ml", recommend = true, threshold = OFFLOAD_THRESHOLD } = {}) {
  const plain = withStringIds(listings);

  if (plain.length <= threshold) {
    return groupAndRecommend(plain, { strategy, recommend });
  }
  return getGroupingPool().run("group", { listings: plain, strategy, recommend });
}

/** Ranks a category's top deals in a worker (see dealsRanking.service.js). */
export function computeDealsOffThread(listings, options = {}, { timeoutMs } = {}) {
  return getGroupingPool().run("deals", { listings: withStringIds(listings), options }, { timeoutMs });
}
