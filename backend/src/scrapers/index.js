// index.js
// Runs all fixed platform scrapers and returns combined results.
//
// Usage:
//   node index.js "iphone 15"
//   node index.js "samsung galaxy s24"

import { config } from "dotenv";
config({
  path: new URL("../../.env", import.meta.url).pathname.replace(
    /^\/([A-Z]:)/,
    "$1"
  ),
});

import { scrapePriceOyeSearch } from "./priceoye.scraper.js";
import { scrapeMegaSearch } from "./mega.scraper.js";
import { scrapeShophiveSearch } from "./shophive.scraper.js";
import { scrapePaklapSearch } from "./paklap.scraper.js";
import { scrapeW11StopSearch } from "./w11stop.scraper.js";
import { scrapeTelemartSearch } from "./telemart.scraper.js";
import { scrapeIShoppingSearch } from "./ishopping.scraper.js";
// Daraz is switched off (see the disabled task in scrapeFixedPlatforms below).
// Re-enable by uncommenting this import and that block.
// import { scrapeDarazSearch } from "./daraz.scraper.js";
import { storeTasks } from "./stores.js";
import { storeBreaker } from "./storeBreaker.js";
import { detectCategory, detectQueryCategory } from "./productCategory.js";
import { quote } from "../config/logSafe.js";

// Query aliases — map shorthand searches to what actually appears in titles
const QUERY_ALIASES = {
  "playstation 5": ["ps5", "playstation5"],
  "ps5": ["playstation 5", "playstation5"],
  "dell laptop": ["dell latitude", "dell inspiron", "dell xps", "dell vostro"],
  "hp laptop": ["hp pavilion", "hp elitebook", "hp probook", "hp envy"],
  "lenovo laptop": ["lenovo thinkpad", "lenovo ideapad", "lenovo thinkbook"],
  "samsung galaxy": ["samsung s", "galaxy s"],
  "samsung s25": ["galaxy s25", "samsung galaxy s25"],
  "samsung s24": ["galaxy s24", "samsung galaxy s24"],
  "s25 ultra": ["galaxy s25 ultra"],
  "s24 ultra": ["galaxy s24 ultra"],
  "z fold": ["galaxy z fold"],
  "z flip": ["galaxy z flip"],
};

function filterByRelevance(listings, query) {
  const q = query.toLowerCase().trim();
  const queryCategory = detectQueryCategory(q);

  // BUG FIX: was `category` (undefined variable); correct name is queryCategory.category
  console.log("[%s] Query %s", queryCategory.category, quote(query));

  return listings
    .map((listing) => {
      const productCategory = detectCategory(listing.title);
      return {
        ...listing,
        category: productCategory.category,
        categoryConfidence: productCategory.confidence,
      };
    })
    .filter((listing) => {
      const title = listing.title.toLowerCase();

      // Category filter — drop listings outside the query's category
      if (
        queryCategory.category !== "other" &&
        listing.category !== queryCategory.category
      ) {
        return false;
      }

      // Exact phrase match
      if (title.includes(q)) return true;

      // Check aliases
      const aliases = QUERY_ALIASES[q] || [];
      if (aliases.some((alias) => title.includes(alias))) return true;

      // Multi-word: require at least 2 matching words
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 1) return title.includes(words[0]);

      const matchingWords = words.filter((w) => title.includes(w));
      return matchingWords.length >= Math.min(2, words.length);
    });
}

/**
 * Runs all fixed scrapers in parallel.
 *
 * @param {string} query
 * @param {{ withReport?: boolean }} [opts]
 * @returns {Promise<object[]>}                                    default (withReport=false)
 * @returns {Promise<{ listings: object[], report: StoreReport[] }>}  when withReport=true
 *
 * @typedef {{
 *   platform:   string,
 *   status:     "ok" | "empty" | "error" | "blocked" | "paused",
 *   fetched:    number,
 *   relevant:   number,
 *   saved?:     number,
 *   durationMs: number,
 *   error?:     string,
 *   until?:     number,
 * }} StoreReport
 */
async function scrapeFixedPlatforms(query, opts = {}) {
  const { withReport = false } = opts;
  const encoded = encodeURIComponent(query);

  const tasks = [
    {
      platform: "priceoye",
      fn: () => scrapePriceOyeSearch(`https://priceoye.pk/search?q=${encoded}`),
    },
    {
      platform: "mega",
      // Mega's own search backend throws a 500 (empty body, confirmed via
      // direct request) for any hyphenated multi-word path -- every query
      // of more than one word was failing, not intermittently, on every
      // single scrape. A literal "+" in the path works instead (verified
      // returning real, relevant result cards); their server evidently
      // does its own space substitution on "+" but not "-".
      fn: () => scrapeMegaSearch(`https://www.mega.pk/search/${query.trim().replace(/\s+/g, "+")}/`),
    },
    {
      platform: "shophive",
      fn: () => scrapeShophiveSearch(`https://www.shophive.com/catalogsearch/result/?q=${encoded}`),
    },
    {
      platform: "paklap",
      // Paklap 403s every plain axios request -- goes through a headless
      // browser instead (see paklap.scraper.js / playwrightFetch.js).
      fn: () => scrapePaklapSearch(`https://www.paklap.pk/catalogsearch/result/index/?cat=0&q=${encoded}`),
    },
    {
      platform: "w11stop",
      fn: () => scrapeW11StopSearch(`https://w11stop.com/search?search=${encoded}`),
    },
    {
      platform: "telemart",
      fn: () => scrapeTelemartSearch(`https://www.telemart.pk/search?q=${encoded}`),
    },
    {
      platform: "ishopping",
      // Same 403-without-a-real-browser issue as Paklap.
      fn: () => scrapeIShoppingSearch(`https://www.ishopping.pk/catalogsearch/result/?q=${encoded}`),
    },
    // DISABLED: Daraz's robots.txt disallows /catalog/ and it is the slowest,
    // least reliable source. The scraper file is kept intact.
    // {
    //   platform: "daraz",
    //   fn: () => scrapeDarazSearch(`https://www.daraz.pk/catalog/?q=${encoded}`),
    // },

    // Stores read through a platform adapter (Shopify, WooCommerce) rather
    // than a scraper of their own: see stores.js.
    ...storeTasks(query),
  ];

  // ── separate paused stores from active ones ───────────────────────────────
  const report = [];
  const live = [];

  for (const task of tasks) {
    if (!storeBreaker.allow(task.platform)) {
      // Store is in a back-off window; record it without launching a fetch.
      // storeBreaker.until() returns the timestamp when the store is retried
      // next, if that method exists; fall back gracefully if it doesn't.
      const until =
        typeof storeBreaker.until === "function"
          ? storeBreaker.until(task.platform)
          : undefined;
      report.push({
        platform:   task.platform,
        status:     "paused",
        fetched:    0,
        relevant:   0,
        durationMs: 0,
        ...(until !== undefined && { until }),
      });
    } else {
      live.push(task);
    }
  }

  // ── run live scrapers in parallel, each timed individually ───────────────
  const settled = await Promise.allSettled(
    live.map(async (task) => {
      const start = Date.now();
      const raw = await task.fn();   // throws on network / HTTP error
      return { platform: task.platform, raw, durationMs: Date.now() - start };
    })
  );

  // ── collect listings and build report entries ─────────────────────────────
  const allListings = [];

  settled.forEach((outcome, i) => {
    const platform = live[i].platform;

    if (outcome.status === "fulfilled") {
      const { raw, durationMs } = outcome.value;
      storeBreaker.success(platform);

      const relevant = filterByRelevance(raw, query);
      console.log(
        "[%s] scraped %d listings → %d relevant",
        platform, raw.length, relevant.length
      );
      allListings.push(...relevant);

      report.push({
        platform,
        status:     raw.length === 0 ? "empty" : "ok",
        fetched:    raw.length,
        relevant:   relevant.length,
        durationMs,
      });
    } else {
      storeBreaker.failure(platform);
      const msg = outcome.reason?.message ?? String(outcome.reason);
      const blocked = /403|429|blocked/i.test(msg);
      console.error("[%s] failed: %s", platform, msg);

      report.push({
        platform,
        status:     blocked ? "blocked" : "error",
        fetched:    0,
        relevant:   0,
        durationMs: 0,
        error:      msg,
      });
    }
  });

  if (!withReport) return allListings;          // ← unchanged default path
  return { listings: allListings, report };
}

/**
 * Public entry point. Default call returns listings array (unchanged).
 * Pass { withReport: true } to also receive the per-store report.
 */
async function scrapeAllPlatforms(query, opts = {}) {
  console.log("Searching for: %s", quote(query));
  return scrapeFixedPlatforms(query, opts);
}

export { scrapeAllPlatforms, scrapeFixedPlatforms };

// CLI usage: node index.js "iphone 15"
const runningDirectly = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("scrapers/index.js");

if (runningDirectly) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const query = args[0] || "iphone";

  scrapeAllPlatforms(query).then((results) => {
    console.log(`\nTotal listings scraped: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
  });
}