// priceoye.scraper.js
//
// STATUS: WORKING (selectors confirmed via DevTools, June 2026).
// PriceOye serves product data as static HTML (AMP-based pages), so
// Axios + Cheerio works fine here — no headless browser needed.

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "priceoye";
const BASE_URL = "https://priceoye.pk";

/**
 * Scrapes a single PriceOye search/category page.
 * @param {string} searchUrl - full URL to a search or category results page
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapePriceOyeSearch(searchUrl) {
  const html = await fetchHtml(searchUrl);
  const $ = cheerio.load(html);

  // Confirmed via DevTools inspection (June 2026): each card IS an <a class="product-card">
  const cards = $("a.product-card").toArray();

  return safeMap(
    cards,
    (el) => {
      const card = $(el);

      const title = cleanText(card.find(".p-title").text());
      const priceRaw = card.find(".price-box").text();
      const originalPriceRaw = card.find(".price-diff-retail").text();
      // href on PriceOye cards is already a full URL
      const href = card.attr("href");
      // Images are rendered via messy/overlapping <amp-img> tags; target the
      // product-thumbnail class specifically, not "first img on card"
      // (the latter can grab unrelated icons like the rating stars image).
      const imageUrl =
        card.find("amp-img.product-thumbnail").first().attr("src") ||
        card.find("img.product-thumbnail").first().attr("src") ||
        null;

      if (!title || !href) return null;

      const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      return makeListing({
        platform: PLATFORM,
        sourceUrl,
        title,
        price: parsePrice(priceRaw),
        originalPrice: parsePrice(originalPriceRaw),
        imageUrl,
      });
    },
    PLATFORM
  );
}

export { scrapePriceOyeSearch };

// Quick manual test:
// node -e "import('./priceoye.scraper.js').then(m => m.scrapePriceOyeSearch('https://priceoye.pk/search?q=iphone')).then(r => console.log(JSON.stringify(r, null, 2)))"