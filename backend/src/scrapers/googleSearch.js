// googleSearch.js
//
// Uses SerpApi (free tier: 100 searches/month) to search Google for a product
// and return e-commerce product page URLs from the results.
//
// This is what makes the generic scraper dynamic — instead of hardcoding
// which sites to check, we let Google tell us which Pakistani e-commerce
// sites carry a specific product, then scrape each one.
//
// Flow:
//   searchForProduct("iphone 15")
//     → searches Google: "iphone 15 buy online Pakistan price"
//     → filters results to e-commerce sites only
//     → excludes platforms already covered by fixed scrapers
//     → returns list of product page URLs
//     → each URL gets passed to scrapeGeneric()
//
// Requirements:
//   - SERPAPI_KEY in backend/.env (free at serpapi.com, 100 searches/month)

// Platforms already covered by fixed scrapers — skip these in Google results
// so we don't double-scrape them
const FIXED_PLATFORMS = [
  "priceoye.pk",
  "mega.pk",
  "shophive.com",
];

// Keywords that suggest a URL is a product listing page (not a blog/review/forum)
const ECOMMERCE_SIGNALS = [
  "/products/",
  "/product/",
  "/p/",
  "/item/",
  "/buy/",
  "/shop/",
  "/catalog/",
  "/dp/",           // Amazon-style
  "/pd/",
  "/detail/",
  "/listing/",
  "/mobiles/",
  "/electronics/",
  "/computers/",
];

// Domains that are clearly not e-commerce (news, blogs, social, review sites)
const BLOCKED_DOMAINS = [
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "reddit.com",
  "wikipedia.org",
  "phonearena.com",
  "gsmarena.com",
  "techreview.pk",
  "propakistani.pk",
  "reviewit.pk",
  "hamariweb.com",
  "imei.info",
];

/**
 * Checks if a URL looks like a product page on an e-commerce site.
 * Filters out news articles, review sites, social media, etc.
 */
function isEcommerceProductUrl(url) {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    const fullUrl = url.toLowerCase();

    // Skip already-covered fixed platforms
    if (FIXED_PLATFORMS.some((p) => domain.includes(p))) return false;

    // Skip known non-e-commerce domains
    if (BLOCKED_DOMAINS.some((d) => domain.includes(d))) return false;

    // Must have at least one e-commerce URL signal
    const hasEcommerceSignal = ECOMMERCE_SIGNALS.some((signal) =>
      fullUrl.includes(signal)
    );

    return hasEcommerceSignal;
  } catch {
    return false;
  }
}

/**
 * Searches Google via SerpApi for a product query and returns
 * filtered e-commerce product page URLs.
 *
 * @param {string} query - product name e.g. "iphone 15"
 * @param {number} [maxResults=5] - max number of e-commerce URLs to return
 * @returns {Promise<Array<{url: string, title: string, domain: string}>>}
 */
async function searchForProduct(query, maxResults = 5) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY is not set in your .env file. " +
      "Get your free key from https://serpapi.com and add it to backend/.env"
    );
  }

  // Target Pakistani market specifically
  const searchQuery = `${query} buy online Pakistan price`;
  const params = new URLSearchParams({
    q: searchQuery,
    api_key: apiKey,
    gl: "pk",           // country: Pakistan
    hl: "en",           // language: English
    num: "10",          // fetch top 10 results to filter from
    engine: "google",
  });

  console.log(`[googleSearch] Searching: "${searchQuery}"`);

  const response = await fetch(
    `https://serpapi.com/search.json?${params.toString()}`
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SerpApi error ${response.status}: ${err}`);
  }

  const data = await response.json();

  // SerpApi returns organic_results array with link, title, snippet per result
  const organicResults = data.organic_results || [];

  if (organicResults.length === 0) {
    console.warn("[googleSearch] No organic results returned from SerpApi");
    return [];
  }

  // Filter to e-commerce product URLs only
  const ecommerceResults = organicResults
    .filter((result) => result.link && isEcommerceProductUrl(result.link))
    .slice(0, maxResults)
    .map((result) => ({
      url: result.link,
      title: result.title || "",
      domain: new URL(result.link).hostname.replace(/^www\./, ""),
    }));

  console.log(
    `[googleSearch] Found ${ecommerceResults.length} e-commerce results ` +
    `from ${organicResults.length} total results`
  );

  ecommerceResults.forEach((r) => console.log(`  → ${r.domain}: ${r.url}`));

  return ecommerceResults;
}

export { searchForProduct, isEcommerceProductUrl };

// CLI test: node googleSearch.js "samsung galaxy s24"
if (process.argv[1].includes("googleSearch")) {
  const { config } = await import("dotenv");
  config({
    path: new URL("../../.env", import.meta.url).pathname.replace(
      /^\/([A-Z]:)/,
      "$1"
    ),
  });

  const query = process.argv[2] || "iphone 15";
  searchForProduct(query)
    .then((results) => {
      console.log("\nE-commerce URLs found:");
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((err) => console.error("Failed:", err.message));
}