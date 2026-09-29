// benchmark-scrapers.js — measures scraper coverage on a fixed set of realistic
// shopping queries, so a scraper change can be judged by numbers before and
// after instead of by feel.
//
// It runs each query through the live scrapers (scrapeAllPlatforms) and prints
// how many RELEVANT listings each platform returned and how long the query
// took. It does NOT touch the database: nothing is saved.
//
// It makes real requests to every enabled store, about one round per query, so
// run it sparingly (at most once a day) and keep the delay between queries.
//
// Usage (from backend/):
//   node src/scripts/benchmark-scrapers.js                    all queries
//   node src/scripts/benchmark-scrapers.js --limit 5          first five only
//   node src/scripts/benchmark-scrapers.js --only "iphone 17 pro,galaxy watch 8"
//   node src/scripts/benchmark-scrapers.js --delay 5000       ms between queries (default 3000)
//
// Paste the two tables it prints into the team chat, and keep them: the point
// is comparing today's output with the next run.

import { scrapeAllPlatforms } from "../scrapers/index.js";

const BENCHMARK_QUERIES = [
  "iphone 17 pro", "samsung galaxy a17", "redmi note 14", "samsung galaxy s26 ultra",
  "oppo reno 14", "infinix hot 60", "vivo y31d", "xiaomi 14",
  "macbook air m5", "thinkpad e14", "hp laptop 15", "dell latitude",
  "acer nitro v", "asus vivobook", "lenovo ideapad slim 5", "samsung 55 inch tv",
  "tcl 65 inch", "hisense 50 inch", "orient 32 inch", "galaxy watch 8",
  "apple watch series 11", "airpods pro", "galaxy buds 3", "ipad air",
  "galaxy tab s10", "sony headphones", "playstation 5", "samsung washing machine",
  "dawlance refrigerator", "haier air conditioner",
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = argValue("--only");
const limit = Number(argValue("--limit")) || undefined;
const delayMs = Number(argValue("--delay")) || 3000;

let queries = only ? only.split(",").map((q) => q.trim()).filter(Boolean) : BENCHMARK_QUERIES;
if (limit) queries = queries.slice(0, limit);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The scrapers log a line per store per query; keep this report readable.
const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};

const perQuery = [];
const totals = {};
const startedAt = Date.now();

for (let i = 0; i < queries.length; i++) {
  const query = queries[i];
  const t0 = Date.now();
  let results = [];
  let failed = false;

  try {
    results = await scrapeAllPlatforms(query);
  } catch {
    failed = true;
  }

  const byPlatform = {};
  for (const listing of results) {
    byPlatform[listing.platform] = (byPlatform[listing.platform] || 0) + 1;
    totals[listing.platform] = (totals[listing.platform] || 0) + 1;
  }

  perQuery.push({ query, seconds: Number(((Date.now() - t0) / 1000).toFixed(1)), total: results.length, failed, ...byPlatform });
  originalLog(`[${i + 1}/${queries.length}] ${query}: ${results.length} listings in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (i < queries.length - 1) await sleep(delayMs);
}

console.log = originalLog;
console.error = originalError;

const platforms = Object.keys(totals).sort();
console.log("\nRelevant listings per platform, summed over all queries");
console.table(
  Object.fromEntries(platforms.map((p) => [p, { listings: totals[p], "queries with any": perQuery.filter((q) => q[p] > 0).length }]))
);

console.log("\nPer query");
console.table(perQuery.map((q) => ({ query: q.query, seconds: q.seconds, total: q.total, ...Object.fromEntries(platforms.map((p) => [p, q[p] ?? 0])) })));

const seconds = perQuery.map((q) => q.seconds).sort((a, b) => a - b);
console.log(
  `\n${queries.length} queries in ${((Date.now() - startedAt) / 1000).toFixed(0)}s. ` +
  `Median ${seconds[Math.floor(seconds.length / 2)]}s per query, slowest ${seconds[seconds.length - 1]}s.` +
  (perQuery.some((q) => q.failed) ? ` ${perQuery.filter((q) => q.failed).length} query(ies) threw.` : "")
);

process.exit(0);
