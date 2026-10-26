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

import { createHash } from "node:crypto";
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

// Same listings in, same groups out. Shoppers ask the same few searches and product pages over and over, and each one sent the
// same job to the workers: at 50 shoppers at once the queue filled and 292 requests were turned away busy (LOAD_TEST.md,
// 2026-10-26). A shopper's job is therefore keyed by everything grouping reads (the listings with their prices, history and when
// they were checked, and the options), and identical jobs share one answer: those that arrive while it runs, and those within
// RESULT_CACHE_MS after. A scrape that changes a price or a check time changes the key, so a stale answer is never served for
// changed listings; the time limit bounds how long a ranking that depends on today's date can be reused.
const RESULT_CACHE_MS = 5 * 60 * 1000;
const RESULT_CACHE_SIZE = 100;
const resultCache = new Map(); // key -> { at, result: Promise<object[]> }

/** For tests: forget the shared answers. */
export function clearGroupingCache() {
  resultCache.clear();
}

function sharedResult(key, compute) {
  const now = Date.now();
  const hit = resultCache.get(key);
  if (hit && now - hit.at < RESULT_CACHE_MS) return hit.result;

  const result = compute();
  resultCache.delete(key);
  resultCache.set(key, { at: now, result });
  if (resultCache.size > RESULT_CACHE_SIZE) resultCache.delete(resultCache.keys().next().value);
  // a failed job (busy, timed out) is not remembered: the next shopper tries again
  result.catch(() => {
    if (resultCache.get(key)?.result === result) resultCache.delete(key);
  });
  return result;
}

/**
 * @param {object[]} listings  plain listing objects
 * @param {object}   [options]
 * @param {"ml"|"rule"} [options.strategy]
 * @param {boolean}  [options.recommend]  attach recommendations to each group (default true)
 * @param {number}   [options.threshold]  listings above this many go to a worker (default OFFLOAD_THRESHOLD)
 * @param {"interactive"|"background"} [options.priority]  background work (cache warm-ups) never takes the last worker
 * @param {number}   [options.timeoutMs]  time limit for this job; the pool's default (90 s) when omitted. A shopper waits on a search, so
 *                                        its default is short; the nightly job groups whole categories and passes a longer one
 * @returns {Promise<object[]>} groups, best-supported first
 */
export async function groupListings(listings = [], { strategy = "ml", recommend = true, threshold = OFFLOAD_THRESHOLD, priority = "interactive", timeoutMs } = {}) {
  const plain = withStringIds(listings);

  if (plain.length <= threshold) {
    return groupAndRecommend(plain, { strategy, recommend });
  }
  const run = () => getGroupingPool().run("group", { listings: plain, strategy, recommend }, { priority, timeoutMs });
  // Background jobs (scripts, the nightly run, cache warm-ups) are one-offs: only a shopper's job is shared.
  if (priority !== "interactive") return run();
  const key = createHash("sha1").update(JSON.stringify([strategy, recommend, plain])).digest("hex");
  return sharedResult(key, run);
}

/** Ranks a category's top deals in a worker (see dealsRanking.service.js). */
export function computeDealsOffThread(listings, options = {}, { timeoutMs } = {}) {
  // The deals feed is computed ahead of time and cached: no shopper waits on it, so it yields to searches and product pages.
  return getGroupingPool().run("deals", { listings: withStringIds(listings), options }, { timeoutMs, priority: "background" });
}
