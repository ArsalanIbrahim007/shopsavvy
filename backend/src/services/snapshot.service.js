// snapshot.service.js — the last computed feeds, kept on disk, so a restart answers at once instead of from scratch.
//
// The home page's rows, the deals, the caught discounts and the honest-prices report are computed from whole categories (seconds to
// minutes: 83 s for the honest-prices report after a restart, 2026-11-08) and kept in memory. A restart (a deploy, nodemon, the
// server rebooting) lost them all, and the first visitors waited. Each feed now writes what it computed here, and after a restart
// serves that while it computes a fresh one in the background (the same stale-while-revalidate the feeds use in memory).
//
//   writeSnapshot("deals-tv", data)  -> <CACHE_DIR>/deals-tv.json (written to a temporary file first, then renamed: never half a file)
//   readSnapshot("deals-tv")         -> data, or null (none, unreadable, or older than MAX_AGE_MS)
//
// Off under tests (they must not read or leave files), and when CACHE_DIR is "off". A failure to read or write is logged and ignored:
// the feed then simply computes, as before.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// A snapshot older than this is not served: the nightly scrape changes prices, and two days covers a missed night.
export const MAX_AGE_MS = 48 * 60 * 60 * 1000;

function cacheDir(env = process.env) {
  if (env.VITEST || env.NODE_ENV === "test" || env.CACHE_DIR === "off") return null;
  return env.CACHE_DIR || join(BACKEND_ROOT, ".cache");
}

const safeName = (name) => String(name).replace(/[^a-z0-9_-]/gi, "_");

/** Writes `data` under `name`. Never throws. */
export async function writeSnapshot(name, data, { env = process.env, now = Date.now() } = {}) {
  const dir = cacheDir(env);
  if (!dir) return false;
  const file = join(dir, `${safeName(name)}.json`);
  try {
    await mkdir(dir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ savedAt: now, data }));
    await rename(temporary, file);
    return true;
  } catch (error) {
    console.warn(`[snapshot] Could not save ${name}: ${error.message}`);
    return false;
  }
}

/** The data saved under `name`, or null when there is none, it cannot be read, or it is too old. Never throws. */
export async function readSnapshot(name, { env = process.env, now = Date.now() } = {}) {
  const dir = cacheDir(env);
  if (!dir) return null;
  try {
    const { savedAt, data } = JSON.parse(await readFile(join(dir, `${safeName(name)}.json`), "utf8"));
    if (!Number.isFinite(savedAt) || now - savedAt > MAX_AGE_MS) return null;
    return data ?? null;
  } catch {
    return null; // none yet, or unreadable: compute instead
  }
}
