// scrapeState.js — remembers, in a small per-machine file, whether today's scheduled scrape has run or is
// running. Two things can start it: the backend's own daily window (priceHistoryJob.js) and the manual /
// Windows Task Scheduler script (src/scripts/run-scheduled-scrape.js). Both ask here first, so a day is
// scraped once however it was started, and two processes never scrape at the same time.
//
// The file is gitignored (.scheduled-scrape-state.json in backend/): it describes this machine only.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// SCRAPE_STATE_FILE lets a test (or a second checkout) use its own file.
export const DEFAULT_STATE_FILE = process.env.SCRAPE_STATE_FILE || join(here, "..", "..", ".scheduled-scrape-state.json");

// A full run takes about 25 minutes. A "running" mark older than this is from a process that died, and so is one
// whose process no longer exists (for example the backend restarting in the middle of a run).
export const STALE_LOCK_MS = 3 * 60 * 60 * 1000;

// Pakistan Standard Time is UTC+5 with no daylight saving. The "day" and the night window are Pakistan's,
// whatever the machine's own time zone is, the same way price history counts days (priceHistory.model.js).
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The Pakistan calendar day of `date`, as YYYY-MM-DD. */
export function pktDay(date = new Date()) {
  return new Date(date.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The hour (0-23) in Pakistan. */
export function pktHour(date = new Date()) {
  return new Date(date.getTime() + PKT_OFFSET_MS).getUTCHours();
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 only checks that the process exists
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, but belongs to someone else
  }
}

function read(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(file, state) {
  writeFileSync(file, JSON.stringify(state, null, 2));
}

/**
 * Tries to claim today's scrape.
 * @returns {{ ok: true } | { ok: false, reason: "done-today" | "running" }}
 */
export function tryStart({ now = new Date(), file = DEFAULT_STATE_FILE, isAlive = processIsAlive, pid = process.pid } = {}) {
  const state = read(file);
  if (state.lastRunDate === pktDay(now)) return { ok: false, reason: "done-today" };

  const since = Date.parse(state.runningSince ?? "");
  const claimed = Number.isFinite(since) && now.getTime() - since < STALE_LOCK_MS;
  if (claimed && Number.isInteger(state.pid) && state.pid !== pid && isAlive(state.pid)) return { ok: false, reason: "running" };

  write(file, { ...state, runningSince: now.toISOString(), pid });
  return { ok: true };
}

/** Today's scrape finished: remember the day and release the claim. */
export function markDone({ now = new Date(), file = DEFAULT_STATE_FILE } = {}) {
  write(file, { lastRunDate: pktDay(now) });
}

/** Today's scrape failed: release the claim so the next check can retry. The last good day is kept. */
export function markFailed({ file = DEFAULT_STATE_FILE } = {}) {
  const { lastRunDate } = read(file);
  write(file, { lastRunDate: lastRunDate ?? null });
}

/** Whether today's scrape has already run (for a quick check that does not claim anything). */
export function isDoneToday({ now = new Date(), file = DEFAULT_STATE_FILE } = {}) {
  return read(file).lastRunDate === pktDay(now);
}
