// warm-up.js — opens every main page once right after the API starts, so the first visitor does not wait for it.
//
//   node src/scripts/ops/warm-up.js                       against http://localhost:5000
//   node src/scripts/ops/warm-up.js http://localhost:5099 against another port
//
// `Run ShopSavvy Online.cmd` starts it beside the API. Why it is needed (measured 2026-11-18, a second API started on an empty cache
// folder, as on a clean machine or after a reinstall): the home page's rows answered after 13 to 79 s, the Air conditioners page after
// 85 s and Honest prices after 89 s, close to the 100 s the website waits; with the cache folder of a previous run, every page answered
// within 2.1 s. The API groups each category in the background at start-up (app.js), one at a time; this waits for each in turn by
// asking for a product past the saved first page (`offset=60`), which only the fully grouped category can answer. A grouped catalogue
// is also what makes a product page show the same offers as its card (productView.service.js).

import { fileURLToPath } from "node:url";

import { DEAL_CATEGORIES } from "../../services/dealsFeed.service.js";

const HEALTH_WAIT_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6 * 60 * 1000; // one category's full grouping may take minutes on a cold, busy PC

/** Searches a demonstration or a first visitor is likely to make, one or two per category. */
export const WARM_SEARCHES = [
  "samsung galaxy a17", "iphone 17 pro max", "redmi note 15", "infinix hot 60",
  "dell latitude", "hp elitebook", "macbook air m5",
  "samsung 55 inch", "tcl led", "haier 1.5 ton inverter", "gree 1.5 ton", "dawlance refrigerator", "haier washing machine",
  "airpods pro", "samsung galaxy watch", "ipad",
];

/** The pages to open once, in the order a demonstration needs them. */
export function warmUpPaths(categories = DEAL_CATEGORIES) {
  return [
    "/api/listings/stats",
    "/api/listings/caught",
    "/api/listings/deals?limit=8",
    // every category grouped in full (past the saved first page), the order app.js warms them in
    ...categories.map((category) => `/api/listings/catalog?category=${category}&offset=60&limit=1`),
    "/api/integrity",
    "/api/listings/drops?limit=48",
    // popular searches across the categories (2026-11-28): a search's first answer took 1-1.4 s, a repeat 0.25 s
    ...WARM_SEARCHES.map((q) => `/api/listings/search?q=${encodeURIComponent(q)}`),
  ];
}

/**
 * Waits for the API to answer its health check, then requests each path in turn. Never throws: a page that fails is reported and the
 * rest still run.
 * @returns {Promise<{ok: boolean, results: Array<{path: string, ms: number, status: number|string}>}>}
 */
export async function warmUp({ base = "http://localhost:5000", paths = warmUpPaths(), fetchImpl = fetch, log = console.log,
  healthWaitMs = HEALTH_WAIT_MS, pollMs = 1000, now = Date.now } = {}) {
  const root = base.replace(/\/+$/, "");
  const started = now();
  for (;;) {
    try {
      if ((await fetchImpl(`${root}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (now() - started > healthWaitMs) {
      log(`[warm-up] The API at ${root} did not answer within ${Math.round(healthWaitMs / 1000)} s. Is it running?`);
      return { ok: false, results: [] };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  log(`[warm-up] API is up; opening ${paths.length} pages once (a few minutes on a cold start)...`);

  const results = [];
  for (const path of paths) {
    const t = now();
    let status;
    try {
      const res = await fetchImpl(`${root}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      await res.arrayBuffer();
      status = res.status;
    } catch (error) {
      status = error?.name === "TimeoutError" ? "timed out" : `failed: ${error?.message ?? error}`;
    }
    const ms = now() - t;
    results.push({ path, ms, status });
    log(`[warm-up] ${String(Math.round(ms / 100) / 10).padStart(6)} s  ${status}  ${path}`);
  }
  const ok = results.every((r) => r.status === 200);
  log(ok
    ? `[warm-up] Done in ${Math.round((now() - started) / 1000)} s: every page is ready.`
    : "[warm-up] Done, but some pages did not answer (above). The site still works; those pages may be slow the first time.");
  return { ok, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok } = await warmUp({ base: process.argv[2] || `http://localhost:${process.env.PORT || 5000}` });
  process.exit(ok ? 0 : 1);
}
