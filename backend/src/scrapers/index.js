// index.js
// Entry point to run all scrapers and combine their output.
//
// Two-layer scraping strategy:
//   Layer 1 (Fixed): PriceOye, Mega, Shophive — fast, free, return many results
//   Layer 2 (Dynamic): Google Search → discover other e-commerce sites →
//                      AI generic scraper extracts each product page
//
// Usage:
//   node index.js "iphone 15"           — fixed scrapers only (fast)
//   node index.js "iphone 15" --all     — fixed + Google-discovered sites (slower)

// Load .env first so all API keys are available (SERPAPI_KEY, GROQ_API_KEY etc.)
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
import { scrapeGeneric } from "./generic.scraper.js";
import { searchForProduct } from "./googleSearch.js";

/**
 * Filters scraped listings to only those relevant to the search query.
 * Uses phrase matching — the title must contain the full query as a phrase,
 * or at least the most specific part of it (last 2 words if query is long).
 * e.g. "iphone 15" will NOT match "iPhone 17" or "iPhone charger"
 */
function filterByRelevance(listings, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return listings;

  return listings.filter((listing) => {
    const title = listing.title.toLowerCase();

    // First try: exact phrase match (most strict)
    if (title.includes(q)) return true;

    // Second try: if query has 3+ words, check if last 2 words appear together
    // e.g. "apple iphone 15" → check for "iphone 15" in title
    if (words.length >= 3) {
      const lastTwo = words.slice(-2).join(" ");
      if (title.includes(lastTwo)) return true;
    }

    // For single-word queries, just check word presence
    if (words.length === 1) return title.includes(words[0]);

    return false;
  });
}

/**
 * Layer 1: Run fixed scrapers on known platforms.
 * Fast, free, returns many listings per platform.
 */
async function scrapeFixedPlatforms(query) {
  const encoded = encodeURIComponent(query);

  const tasks = [
    { platform: "priceoye", fn: () => scrapePriceOyeSearch(`https://priceoye.pk/search?q=${encoded}`) },
    { platform: "mega",     fn: () => scrapeMegaSearch(`https://www.mega.pk/search/${query.replace(/\s+/g, "-")}/`) },
    { platform: "shophive", fn: () => scrapeShophiveSearch(`https://www.shophive.com/catalogsearch/result/?q=${encoded}`) },
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

/**
 * Layer 2: Use Google to discover additional e-commerce sites,
 * then use the AI generic scraper to extract each product page.
 * Slower (one AI call per URL) but discovers sites we haven't hardcoded.
 *
 * @param {string} query
 * @param {number} [maxSites=4] - max additional sites to scrape from Google
 */
async function scrapeDiscoveredPlatforms(query, maxSites = 4) {
  console.log("\n[dynamic] Starting Google-powered discovery...");

  let urls;
  try {
    urls = await searchForProduct(query, maxSites);
  } catch (err) {
    console.error("[dynamic] Google search failed:", err.message);
    return [];
  }

  if (urls.length === 0) {
    console.log("[dynamic] No new e-commerce sites found via Google");
    return [];
  }

  // Scrape each discovered URL with the generic AI scraper
  // Run sequentially to avoid hammering Groq rate limits
  const results = [];
  for (const { url, domain } of urls) {
    try {
      console.log(`[dynamic] Scraping ${domain}...`);
      const listing = await scrapeGeneric(url);
      results.push(listing);
      console.log(`[dynamic] ✓ Got: ${listing.title} — Rs ${listing.price}`);
    } catch (err) {
      console.warn(`[dynamic] ✗ Failed ${domain}:`, err.message);
    }
  }

  console.log(`[dynamic] Scraped ${results.length}/${urls.length} discovered sites`);
  return results;
}

/**
 * Main entry point — runs both layers and merges results.
 *
 * @param {string} query - product search term
 * @param {object} [opts]
 * @param {boolean} [opts.dynamic=false] - also run Google discovery layer
 * @param {number}  [opts.maxSites=4]    - max sites to discover via Google
 */
async function scrapeAllPlatforms(query, opts = {}) {
  const { dynamic = false, maxSites = 4 } = opts;

  console.log(`\nSearching for: "${query}"`);
  console.log(`Mode: ${dynamic ? "fixed + dynamic (Google discovery)" : "fixed only"}\n`);

  // Always run fixed scrapers
  const fixedResults = await scrapeFixedPlatforms(query);

  // Optionally run dynamic Google discovery
  const dynamicResults = dynamic
    ? await scrapeDiscoveredPlatforms(query, maxSites)
    : [];

  return [...fixedResults, ...dynamicResults];
}

export { scrapeAllPlatforms, scrapeFixedPlatforms, scrapeDiscoveredPlatforms };

// CLI usage:
//   node index.js "iphone 15"         → fixed scrapers only
//   node index.js "iphone 15" --all   → fixed + Google discovery
const query = process.argv[2] || "iphone";
const dynamic = process.argv.includes("--all");

scrapeAllPlatforms(query, { dynamic }).then((results) => {
  console.log(`\nTotal listings scraped: ${results.length}`);
  console.log(JSON.stringify(results, null, 2));
});