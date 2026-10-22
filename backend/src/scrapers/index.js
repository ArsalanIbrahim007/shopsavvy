import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });

import { scrapePriceOyeSearch } from "./priceoye.scraper.js";
import { scrapeMegaSearch } from "./mega.scraper.js";
import { scrapeShophiveSearch } from "./shophive.scraper.js";
import { scrapePaklapSearch } from "./paklap.scraper.js";
import { scrapeW11StopSearch } from "./w11stop.scraper.js";
import { scrapeTelemartSearch } from "./telemart.scraper.js";
import { scrapeIShoppingSearch } from "./ishopping.scraper.js";
// Daraz disabled: robots.txt disallows the product catalogue (/catalogsearch/ and /s/ are Disallowed)
// import { scrapeDarazSearch } from "./daraz.scraper.js";
import { storeTasks } from "./stores.js";
// Store breaker: pauses a store after 5 consecutive failures (5 min, then 15, then 30).
// One probe request is sent after each pause to check if the store recovered.
import { storeBreaker } from "./storeBreaker.js";
import { allowedPlatforms } from "./storeRouting.js";
import { detectCategory, detectQueryCategory } from "./productCategory.js";
import { quote } from "../config/logSafe.js";

// FIX 3: QUERY_ALIASES — keep the original content exactly as it is on main.
// Do not re-align spacing here; it only adds noise to the diff.
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
  // FIX 5: log line format changed from "[%s] Query %s" (looked like a store tag)
  // to "[category] Query %s → %s" so it is clearly a category line, not a store line
  console.log("[category] Query %s → %s", quote(query), queryCategory.category);
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
      if (
        queryCategory.category !== "other" &&
        listing.category !== queryCategory.category
      )
        return false;
      if (title.includes(q)) return true;
      const aliases = QUERY_ALIASES[q] || [];
      if (aliases.some((alias) => title.includes(alias))) return true;
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 1) return title.includes(words[0]);
      const matchingWords = words.filter((w) => title.includes(w));
      return matchingWords.length >= Math.min(2, words.length);
    });
}

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
      fn: () =>
        scrapeMegaSearch(
          `https://www.mega.pk/search/${query.trim().replace(/\s+/g, "+")}/`
        ),
    },
    {
      platform: "shophive",
      fn: () =>
        scrapeShophiveSearch(
          `https://www.shophive.com/catalogsearch/result/?q=${encoded}`
        ),
    },
    {
      platform: "paklap",
      fn: () =>
        scrapePaklapSearch(
          `https://www.paklap.pk/catalogsearch/result/index/?cat=0&q=${encoded}`
        ),
    },
    {
      platform: "w11stop",
      fn: () =>
        scrapeW11StopSearch(`https://w11stop.com/search?search=${encoded}`),
    },
    {
      platform: "telemart",
      fn: () =>
        scrapeTelemartSearch(`https://www.telemart.pk/search?q=${encoded}`),
    },
    {
      platform: "ishopping",
      fn: () =>
        scrapeIShoppingSearch(
          `https://www.ishopping.pk/catalogsearch/result/?q=${encoded}`
        ),
    },
    ...storeTasks(query),
  ];

  const report = [];
  const live = [];

  const pausedEntries = storeBreaker.paused();
  const pausedMap = new Map(pausedEntries.map((e) => [e.platform, e]));

  // S5: smart routing — skip platforms that never carry this category
  const { category: qCategory } = detectQueryCategory(query.toLowerCase().trim());
  const allowed = allowedPlatforms(qCategory);

  for (const task of tasks) {
    if (!storeBreaker.allow(task.platform)) {
      const entry = pausedMap.get(task.platform);
      report.push({
        platform: task.platform,
        status: "paused",
        fetched: 0,
        relevant: 0,
        durationMs: 0,
        ...(entry?.until !== undefined && { until: entry.until }),
      });
    } else if (allowed !== null && !allowed.has(task.platform)) {
      // this platform has never returned results for this category — skip it
      report.push({ platform: task.platform, status: "skipped", fetched: 0, relevant: 0, durationMs: 0 });
    } else {
      live.push(task);
    }
  }

  // FIX 4: time failed stores too.
  // Each task resolves to { platform, ok, raw?, reason?, durationMs }
  // so the rejection branch always has a real elapsed time.
  const results = await Promise.all(
    live.map(async (task) => {
      const start = Date.now();
      try {
        const raw = await task.fn();
        return { platform: task.platform, ok: true, raw, durationMs: Date.now() - start };
      } catch (err) {
        return { platform: task.platform, ok: false, reason: err, durationMs: Date.now() - start };
      }
    })
  );

  const allListings = [];

  for (const result of results) {
    const { platform, durationMs } = result;
    if (result.ok) {
      const { raw } = result;
      storeBreaker.success(platform);
      const relevant = filterByRelevance(raw, query);
      console.log(
        "[%s] scraped %d listings → %d relevant",
        platform,
        raw.length,
        relevant.length
      );
      allListings.push(...relevant);
      report.push({
        platform,
        status: raw.length === 0 ? "empty" : "ok",
        fetched: raw.length,
        relevant: relevant.length,
        durationMs,
      });
    } else {
      storeBreaker.failure(platform);
      const msg = result.reason?.message ?? String(result.reason);
      const blocked = /403|429|blocked/i.test(msg);
      console.error("[%s] failed: %s", platform, msg);
      report.push({
        platform,
        status: blocked ? "blocked" : "error",
        fetched: 0,
        relevant: 0,
        durationMs,
        error: msg,
      });
    }
  }

  if (!withReport) return allListings;
  return { listings: allListings, report };
}

async function scrapeAllPlatforms(query, opts = {}) {
  console.log("Searching for: %s", quote(query));
  return scrapeFixedPlatforms(query, opts);
}

export { scrapeAllPlatforms, scrapeFixedPlatforms };

// CLI: node scrapers/index.js "iphone 17 pro"
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: node scrapers/index.js <query>");
    process.exit(1);
  }
  scrapeAllPlatforms(query, { withReport: true }).then(({ listings, report }) => {
    console.log("\n--- Report ---");
    report.forEach((r) => console.log(JSON.stringify(r)));
    console.log(`\n${listings.length} listings total`);
  });
}