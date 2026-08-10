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
import { scrapeTelemartSearch } from "./telemart.scraper.js";
import { scrapeGeneric } from "./generic.scraper.js";
import { searchForProduct } from "./googleSearch.js";
import { detectCategory, detectQueryCategory } from "./productCategory.js";

// Known aliases — if user searches these, also match the alternatives in titles
const QUERY_ALIASES = {
  "playstation 5": ["ps5", "playstation5"],
  "ps5": ["playstation 5", "playstation5"],
  "dell laptop": ["dell latitude", "dell inspiron", "dell xps", "dell vostro"],
  "hp laptop": ["hp pavilion", "hp elitebook", "hp probook", "hp envy"],
  "lenovo laptop": ["lenovo thinkpad", "lenovo ideapad", "lenovo thinkbook"],
  "samsung galaxy": ["samsung s", "galaxy s"],
};

/**
 * Filters scraped listings to only those relevant to the search query.
 * Handles exact phrase matching, partial matching, and known aliases.
 */

// Words that indicate an accessory, not a main product
const ACCESSORY_KEYWORDS = [
  // General accessories
  "bag",
  "backpack",
  "sleeve",
  "case",
  "cover",
  "pouch",
  "holder",
  "mount",
  "stand",

  // Charging / power
  "charger",
  "charging cable",
  "power cable",
  "adapter",
  "power adapter",
  "power bank",
  "powerbank",
  "battery",

  // Protection
  "screen protector",
  "screen guard",
  "tempered glass",
  "tempered",
  "protector",
  "skin",

  // Audio
  "handsfree",
  "earphone",
  "earphones",
  "headphone",
  "headphones",
  "headset",
  "airpods",

  // Computer peripherals
  "keyboard",
  "mouse",
  "mouse pad",
  "webcam",
  "cooling pad",
  "cooling fan",
  "laptop cooler",
  "docking station",
  "dock",
  "hub",
  "converter",

  // Replacement parts
  "replacement",
  "replacement screen",
  "replacement battery",
  "replacement keyboard",
];
 
// Phone/laptop brand keywords — accessory filter only applies to these queries
const MAIN_PRODUCT_KEYWORDS = [
  "iphone", "samsung", "galaxy", "pixel", "oneplus", "oppo", "vivo",
  "xiaomi", "redmi", "realme", "huawei", "nokia", "motorola",
  "macbook", "laptop", "dell", "hp", "lenovo", "asus", "acer",
  "playstation", "ps5", "xbox", "nintendo",
];

/**
 * Checks if a query is for a main product (phone/laptop)
 * rather than an accessory search
 */
function isMainProductQuery(query) {
  const q = query.toLowerCase().trim();

  // the user is intentionally searching for an accessory.
  if (isAccessory(q)) {
    return false;
  }

  return MAIN_PRODUCT_KEYWORDS.some((keyword) =>
    q.includes(keyword)
  );
}

/**
 * Checks if a product title is an accessory
 */
function isAccessory(title) {
  const t = title.toLowerCase().trim();

  return ACCESSORY_KEYWORDS.some((keyword) => {
    return t.includes(keyword);
  });
}
 

function filterByRelevance(listings, query) {
  const q = query.toLowerCase().trim();

  const queryCategory = detectQueryCategory(q);

  console.log(
    `[category] Query "${query}" detected as: ${queryCategory.category}`
  );

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

      // --------------------------------------------------
      // CATEGORY FILTER
      // --------------------------------------------------

      // If we know the category of the query,
      // only keep products from that category.
      if (
        queryCategory.category !== "other" &&
        listing.category !== queryCategory.category
      ) {
        return false;
      }

      // --------------------------------------------------
      // TEXT RELEVANCE FILTER
      // --------------------------------------------------

      // Exact phrase match
      if (title.includes(q)) {
        return true;
      }

      // Single-word searches
      const words = q
        .split(/\s+/)
        .filter((word) => word.length > 2);

      if (words.length === 1) {
        return title.includes(words[0]);
      }

      // For multi-word searches, require at least
      // some meaningful part of the query.
      const matchingWords = words.filter((word) =>
        title.includes(word)
      );

      return matchingWords.length >= Math.min(2, words.length);
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
    { platform: "telemart", fn: () => scrapeTelemartSearch(`https://www.telemart.pk/search?collection=all&type=product&q=${encoded}`) }
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

// Only run CLI code when this file is executed directly (not when imported)
// Works reliably on Windows by checking the filename, not the full URL
const runningDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("scrapers/index.js");

if (runningDirectly) {
  // Filter out flags to get the actual query argument
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const query = args[0] || "iphone";
  const dynamic = process.argv.includes("--all");

  scrapeAllPlatforms(query, { dynamic }).then((results) => {
    console.log(`\nTotal listings scraped: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
  });
}