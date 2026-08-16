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
// import { scrapePaklapSearch } from "./paklap.scraper.js";
import { scrapeW11StopSearch } from "./w11stop.scraper.js";
import { detectCategory, detectQueryCategory } from "./productCategory.js";

// Query aliases — map shorthand searches to what actually appears in titles
const QUERY_ALIASES = {
  "playstation 5":   ["ps5", "playstation5"],
  "ps5":             ["playstation 5", "playstation5"],
  "dell laptop":     ["dell latitude", "dell inspiron", "dell xps", "dell vostro"],
  "hp laptop":       ["hp pavilion", "hp elitebook", "hp probook", "hp envy"],
  "lenovo laptop":   ["lenovo thinkpad", "lenovo ideapad", "lenovo thinkbook"],
  "samsung galaxy":  ["samsung s", "galaxy s"],
  "samsung s25":     ["galaxy s25", "samsung galaxy s25"],
  "samsung s24":     ["galaxy s24", "samsung galaxy s24"],
  "s25 ultra":       ["galaxy s25 ultra"],
  "s24 ultra":       ["galaxy s24 ultra"],
  "z fold":          ["galaxy z fold"],
  "z flip":          ["galaxy z flip"],
};

function filterByRelevance(listings, query) {
  const q = query.toLowerCase().trim();
  const queryCategory = detectQueryCategory(q);

  console.log(`[category] Query "${query}" → ${queryCategory.category}`);

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
 * Runs all fixed scrapers in parallel and returns filtered results.
 */
async function scrapeFixedPlatforms(query) {
  const encoded = encodeURIComponent(query);

  const tasks = [
    {
      platform: "priceoye",
      fn: () => scrapePriceOyeSearch(`https://priceoye.pk/search?q=${encoded}`),
    },
    {
      platform: "mega",
      fn: () => scrapeMegaSearch(`https://www.mega.pk/search/${query.replace(/\s+/g, "-")}/`),
    },
    {
      platform: "shophive",
      fn: () => scrapeShophiveSearch(`https://www.shophive.com/catalogsearch/result/?q=${encoded}`),
    },
    // {
    //   platform: "paklap",
    //   fn: () => scrapePaklapSearch(`https://www.paklap.pk/catalogsearch/result/index/?cat=0&q=${encoded}`),
    // },
    {
      platform: "w11stop",
      fn: () => scrapeW11StopSearch(`https://w11stop.com/search?search=${encoded}`),
    },
  ];

  const settled = await Promise.allSettled(tasks.map((t) => t.fn()));
  const results = [];

  settled.forEach((outcome, i) => {
    const platform = tasks[i].platform;
    if (outcome.status === "fulfilled") {
      const filtered = filterByRelevance(outcome.value, query);
      console.log(
        `[${platform}] scraped ${outcome.value.length} listings → ${filtered.length} relevant`
      );
      results.push(...filtered);
    } else {
      console.error(`[${platform}] failed:`, outcome.reason.message);
    }
  });

  return results;
}

async function scrapeAllPlatforms(query, opts = {}) {
  console.log(`\nSearching for: "${query}"\n`);
  return scrapeFixedPlatforms(query);
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