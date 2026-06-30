// index.js
// Entry point to run all platform scrapers and combine their output.
// Useful for manual testing and for wiring into a seed script or cron job later.

import { scrapePriceOyeSearch } from "./priceoye.scraper.js";
import { scrapeMegaSearch } from "./mega.scraper.js";
import { scrapeShophiveSearch } from "./shophive.scraper.js";

/**
 * Runs all scrapers for a given product query/term.
 * NOTE: each platform has a different search URL pattern — confirm these
 * during the feasibility audit and adjust accordingly.
 *
 * @param {string} query - e.g. "iphone 13"
 */
async function scrapeAllPlatforms(query) {
  const encoded = encodeURIComponent(query);

  const tasks = [
    { platform: "priceoye", fn: () => scrapePriceOyeSearch(`https://priceoye.pk/search?q=${encoded}`) },
    { platform: "mega", fn: () => scrapeMegaSearch(`https://www.mega.pk/search/${encoded}/`) },
    { platform: "shophive", fn: () => scrapeShophiveSearch(`https://www.shophive.com/catalogsearch/result/?q=${encoded}`) },
  ];

  // Run independently so one platform failing doesn't kill the others
  const settled = await Promise.allSettled(tasks.map((t) => t.fn()));

  const results = [];
  settled.forEach((outcome, i) => {
    const platform = tasks[i].platform;
    if (outcome.status === "fulfilled") {
      console.log(`[${platform}] scraped ${outcome.value.length} listings`);
      results.push(...outcome.value);
    } else {
      console.error(`[${platform}] failed:`, outcome.reason.message);
    }
  });

  return results;
}

export { scrapeAllPlatforms };

// CLI usage: node index.js "iphone 13"
// (No isMainModule guard — this file is only ever invoked directly as a
// CLI script. The import.meta.url vs process.argv[1] comparison trick is
// unreliable on Windows due to path/URL formatting differences.)
const query = process.argv[2] || "iphone";
scrapeAllPlatforms(query).then((results) => {
  console.log(`\nTotal listings scraped: ${results.length}`);
  console.log(JSON.stringify(results, null, 2));
});