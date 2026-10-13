// scheduledScraping.service.js — builds the query list a scheduled job
// should re-scrape, and runs it with pacing between requests.
//
// There's no "tracked products" concept in the schema yet, so this derives
// one representative search query per distinct PRODUCT (not per raw
// listing) by reusing the existing grouping logic -- re-scraping by raw
// listing would mean ~870 individual full 4-platform searches, the vast
// majority redundant with each other, and enough load to risk getting the
// scrapers rate-limited or blocked by the source sites.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { groupListings } from "./grouping.service.js";
import { modelTokens } from "./normalizeTitle.service.js";
import { runScrapersAndSave } from "./scraper.service.js";

const MAX_QUERY_WORDS = 4;

// Demo queries carry hand-seeded originalPrice values (src/scripts/demo-data/seed-fake-discount.js)
// so the fake-discount badges have something to show. A scheduled re-scrape
// upserts fresh price/originalPrice from the live site on every run, which
// would silently overwrite that seeding -- the demo routine already re-seeds
// right before presenting (see context.md's Demo Operations section), but
// that only helps if it's actually run that day; excluding these here means
// an unattended overnight job can't quietly break the demo in the meantime.
const DEMO_PROTECTED_QUERIES = new Set(["iphone 17 pro", "samsung galaxy a57"]);

// modelTokens() strips capacity tokens ("8gb", "256gb") but leaves a bare
// "ram" or "storage" behind when the title spells them out separately
// ("8GB RAM 256GB Storage"), producing a garbled query like "galaxy a17
// ram". These only matter for reading the numbers next to them, which
// modelTokens already removed, so they're dropped here too -- scoped to
// query derivation only, not touching normalizeTitle itself, since other
// callers (matching, grouping) don't have this problem.
const STRAY_WORDS = new Set(["ram", "storage"]);

/**
 * A search-friendly query from a product group's title: brand + model name,
 * capacity and marketing noise already stripped by modelTokens, capped to a
 * handful of words so it reads like something a real shopper would type
 * rather than a full product title.
 */
export function deriveQuery(title) {
  const words = modelTokens(title).split(" ").filter((w) => w && !STRAY_WORDS.has(w));
  return words.slice(0, MAX_QUERY_WORDS).join(" ");
}

// Products only one store sells (73% of the listings on 2026-10-08: all of Paklap's) have nothing to compare against, so they are not
// queried every night. But a listing is only refreshed when a query returns it, so left alone they all went out of date together
// (offerFreshness.service.js: 14 days). Each night a bounded number of them are queried as well: the ones not refreshed for more than
// STALE_SINGLE_AFTER_DAYS days, the oldest first, taken from each store in turn so that one large store (PriceOye has 1,500 of them)
// cannot use up the night's share. A listing that was just refreshed drops out of the list, so the rotation moves on by itself.
export const STALE_SINGLE_AFTER_DAYS = 7;
export const STALE_SINGLE_PER_RUN = 120;
const DAY_MS = 24 * 3600 * 1000;

// Grouping all of a category's listings at once (to find the products) is the slow part of building the list: 162 s for accessories
// and 58 s for smartphones on 2026-10-13. A search gets 90 s; this job is not waited on.
export const BACKGROUND_GROUP_TIMEOUT_MS = 15 * 60 * 1000;

// The most time a run spends scraping before it stops starting new queries. Task Scheduler stops the task after 3 hours (and a run
// killed that way is neither marked done nor logged), and the page check that follows needs about 20 minutes. On 2026-10-09 a run of
// 594 queries was cut off at query 365; on 10-10 726 queries took 3 h 20 min. Queries come stalest first, so what a short run leaves
// out is what was refreshed most recently.
export const RUN_BUDGET_MS = 150 * 60 * 1000;

// When each query was last run, in a small per-machine file (gitignored, like .scheduled-scrape-state.json). With a budget a night
// cannot run every query, and "oldest listing first" alone would put the same products at the front every night: a listing the store
// no longer shows is never refreshed by any search, so its product stays "stalest" for ever and its query would eat the budget daily
// (the oldest offers in the 2026-10-13 list were 64 to 65 days old). Running whichever queries were run LONGEST AGO first gives every
// query its turn; the age of the listings only orders queries that have never been run, and ties.
const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_QUERY_LOG_FILE = process.env.SCRAPE_QUERY_LOG_FILE || join(here, "..", "..", ".scheduled-query-log.json");
const QUERY_LOG_KEEP_MS = 60 * DAY_MS;
const QUERY_LOG_SAVE_EVERY = 20;

/**
 * @param {{file?: string, now?: () => number}} [options]
 * @returns {{lastQueried: Map<string, number>, record: (query: string) => void, save: () => void}}
 */
export function createQueryLog({ file = DEFAULT_QUERY_LOG_FILE, now = Date.now } = {}) {
  const lastQueried = new Map();
  try {
    const stored = JSON.parse(readFileSync(file, "utf8"));
    for (const [query, at] of Object.entries(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {})) {
      if (Number.isFinite(at) && now() - at < QUERY_LOG_KEEP_MS) lastQueried.set(query, at); // forget queries that stopped being asked
    }
  } catch {
    /* no file yet, or one that cannot be read: every query counts as never run */
  }
  return {
    lastQueried,
    record: (query) => { lastQueried.set(query, now()); },
    save() {
      try {
        writeFileSync(`${file}.tmp`, JSON.stringify(Object.fromEntries(lastQueried)));
        renameSync(`${file}.tmp`, file); // a run killed mid-write never leaves half a file
      } catch (err) {
        console.warn("[scheduledScraping] could not save the query log: %s", err.message);
      }
    },
  };
}

/**
 * Picks up to `count` queries from candidates ({ query, platform, lastScrapedAt }): oldest first within a store, one store at a time
 * in turn. A query that is already wanted (`skip`) or repeated is passed over without using up a place.
 * @returns {string[]}
 */
export function pickStaleSingles(candidates, count, skip = new Set()) {
  const byStore = new Map();
  for (const candidate of candidates) {
    if (!byStore.has(candidate.platform)) byStore.set(candidate.platform, []);
    byStore.get(candidate.platform).push(candidate);
  }
  const queues = [...byStore.values()].map((queue) => queue.sort((a, b) => a.lastScrapedAt - b.lastScrapedAt));

  const picked = new Set();
  while (picked.size < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      while (queue.length > 0) {
        const { query } = queue.shift();
        if (skip.has(query) || picked.has(query)) continue;
        picked.add(query);
        break;
      }
      if (picked.size >= count) break;
    }
  }
  return [...picked];
}

/**
 * Loads every stored listing, groups it into distinct products per
 * category (same logic the search endpoint uses), and returns one
 * deduplicated query per group that is actually compared across platforms.
 *
 * Single-offer groups are mostly skipped: with ~870 listings this produced
 * over 700 distinct queries (about 2,500 now), which at four platforms each
 * is enough daily request volume to risk getting the scrapers rate-limited
 * or blocked. Multi-offer groups are where price history actually matters
 * most anyway -- they're the ones a comparison and a "genuine discount"
 * verdict can be shown for. Their staleness is handled separately, above:
 * up to `staleSingles` of the single-offer products not refreshed for
 * `staleAfterDays` days are added, so every listing is still revisited.
 *
 * The list is ordered by when each query was last RUN (`lastQueried`, see createQueryLog), longest ago first, never-run first; queries
 * with the same time (all of them, before anything has been logged) go by how long ago the product was last refreshed (its OLDEST
 * offer), stalest first. A run that has to stop early (see RUN_BUDGET_MS) then leaves out the queries run most recently, and
 * tomorrow's list starts with the ones it missed.
 *
 * Grouping a whole category takes minutes at this size (accessories, 2,316 listings: 162 s on 2026-10-13, against the 90 s the pool
 * gives a search), so it is given BACKGROUND_GROUP_TIMEOUT_MS: nobody waits on it.
 *
 * @param {{minOffers?: number, staleSingles?: number, staleAfterDays?: number, now?: number, lastQueried?: Map<string, number>}} [opts]
 * @returns {Promise<Array<{query: string, category: string, lastScrapedAt: number, kind: "compared"|"stale-single"}>>}
 */
export async function buildScheduledQueryPlan({
  minOffers = 2, staleSingles = STALE_SINGLE_PER_RUN, staleAfterDays = STALE_SINGLE_AFTER_DAYS, now = Date.now(), lastQueried = new Map(),
} = {}) {
  const listings = await Listing.find(VISIBLE_PLATFORMS_FILTER).lean();

  const byCategory = new Map();
  for (const listing of listings) {
    const category = listing.productCategory || "other";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(listing);
  }

  const cutoff = now - staleAfterDays * DAY_MS;
  const compared = new Map(); // query -> entry; the oldest date wins when two groups give the same query
  const stale = [];
  for (const [category, items] of byCategory) {
    // Rule strategy, no recommendations: this only needs the product clusters. Runs in a
    // worker thread for large categories so the API stays responsive.
    const groups = await groupListings(items, { strategy: "rule", recommend: false, priority: "background", timeoutMs: BACKGROUND_GROUP_TIMEOUT_MS });
    for (const group of groups) {
      const query = deriveQuery(group.rawGroupKey || group.productName || "");
      if (!query || DEMO_PROTECTED_QUERIES.has(query)) continue;

      // A listing that was never dated counts as the oldest there is.
      const dates = (group.offers || []).map((offer) => (offer.lastScrapedAt ? new Date(offer.lastScrapedAt).getTime() : 0));
      const lastScrapedAt = dates.length > 0 ? Math.min(...dates) : 0;

      if ((group.offerCount || 0) >= minOffers) {
        const known = compared.get(query);
        if (!known || lastScrapedAt < known.lastScrapedAt) compared.set(query, { query, category, lastScrapedAt, kind: "compared" });
      } else if (lastScrapedAt < cutoff) {
        stale.push({ query, category, platform: group.offers?.[0]?.platform ?? "", lastScrapedAt });
      }
    }
  }

  const plan = [...compared.values()];
  if (staleSingles > 0) {
    const byQuery = new Map(stale.map((candidate) => [candidate.query, candidate]));
    for (const query of pickStaleSingles(stale, staleSingles, new Set(compared.keys()))) {
      const { category, lastScrapedAt } = byQuery.get(query);
      plan.push({ query, category, lastScrapedAt, kind: "stale-single" });
    }
  }
  const lastRun = (entry) => lastQueried.get(entry.query) ?? 0; // never run: first
  return plan.sort((a, b) => lastRun(a) - lastRun(b) || a.lastScrapedAt - b.lastScrapedAt); // stable: still equal keeps the order above
}

/** The queries of buildScheduledQueryPlan, stalest first. */
export async function buildScheduledQueryList(options = {}) {
  return (await buildScheduledQueryPlan(options)).map((entry) => entry.query);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-scrapes every derived query in sequence (never in parallel -- this is
 * a background job with no user waiting on it, and hammering four sites
 * concurrently is exactly the kind of load that gets a scraper blocked). A
 * delay between requests keeps it polite to the source sites.
 *
 * Stops starting new queries once `budgetMs` has passed (RUN_BUDGET_MS by default) and says how many were left: `skipped`.
 *
 * With a `queryLog` (createQueryLog) each query is recorded as run, success or failure, and the log is saved every
 * QUERY_LOG_SAVE_EVERY queries and at the end, so a run that is killed keeps nearly all of it. Without `queries`, the list is built
 * here with the default log.
 *
 * @param {{queries?: string[], delayMs?: number, budgetMs?: number, now?: () => number, queryLog?: ReturnType<typeof createQueryLog>, onProgress?: (info) => void}} [opts]
 */
export async function runScheduledScrape(opts = {}) {
  const { delayMs = 3000, budgetMs = RUN_BUDGET_MS, now = Date.now, onProgress } = opts;
  const queryLog = opts.queryLog ?? (opts.queries ? null : createQueryLog());
  const queries = opts.queries || (await buildScheduledQueryList({ lastQueried: queryLog.lastQueried }));

  const summary = { totalQueries: queries.length, totalSaved: 0, failures: [], skipped: 0 };
  const startedAt = now();

  for (let i = 0; i < queries.length; i++) {
    if (now() - startedAt >= budgetMs) {
      summary.skipped = queries.length - i;
      onProgress?.({ index: i, total: queries.length, budgetReached: true, skipped: summary.skipped });
      break;
    }
    const query = queries[i];
    try {
      const saved = await runScrapersAndSave(query);
      summary.totalSaved += saved;
      onProgress?.({ index: i + 1, total: queries.length, query, saved });
    } catch (err) {
      summary.failures.push({ query, error: err.message });
      onProgress?.({ index: i + 1, total: queries.length, query, error: err.message });
    }
    queryLog?.record(query);
    if (queryLog && (i + 1) % QUERY_LOG_SAVE_EVERY === 0) queryLog.save();

    if (i < queries.length - 1) await sleep(delayMs);
  }

  queryLog?.save();
  summary.durationMs = now() - startedAt;
  return summary;
}
