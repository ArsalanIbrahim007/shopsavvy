// shophive.scraper.js
//
// STATUS: WORKING for title/price/image/link (selectors confirmed via
// DevTools, June 2026). Original/discount price NOT yet confirmed —
// the inspected product had no active discount. Verify .old-price .price
// against a sale item before trusting originalPrice output.
// Magento storefront, static HTML, Axios + Cheerio works fine.
// Real search URL: https://www.shophive.com/catalogsearch/result/?q={query}

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "shophive";
const BASE_URL = "https://www.shophive.com";

/**
 * Scrapes a single Shophive search/category page.
 * @param {string} searchUrl
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeShophiveSearch(searchUrl) {
  const html = await fetchHtml(searchUrl);
  const $ = cheerio.load(html);

  // Confirmed via DevTools inspection (June 2026): Magento-based storefront,
  // each card is <li class="item product product-item">
  const cards = $("li.product-item").toArray();

  return safeMap(
    cards,
    (el) => {
      const card = $(el);

      const titleLink = card.find(".product-item-link");
      const title = cleanText(titleLink.text());
      const href = titleLink.attr("href");
      const image = card.find("img.product-image-photo").first();

      const imageUrl =
        image.attr("data-src") ||
        image.attr("data-lazy-src") ||
        image.attr("data-original") ||
        image.attr("src") ||
        image.attr("srcset")?.split(",")[0]?.trim().split(" ")[0] ||
        null;

        console.log({
  title,
  src: image.attr("src"),
  dataSrc: image.attr("data-src"),
  lazySrc: image.attr("data-lazy-src"),
  original: image.attr("data-original"),
  srcset: image.attr("srcset"),
});
      // Magento exposes the clean numeric price via data-price-amount —
      // far more reliable than regexing "Rs 10,799.00" text.
      const priceAmount = card.find("[data-price-amount]").first().attr("data-price-amount");

      // NOTE: not yet confirmed against a discounted product — Magento
      // themes typically mark original price with .old-price .price and
      // discounted price with .special-price .price. Wired in as a
      // fallback; verify once a sale item is inspected.
      const originalPriceRaw = card.find(".old-price .price").first().text();

      if (!title || !href) return null;

      const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      return makeListing({
        platform: PLATFORM,
        sourceUrl,
        title,
        price: priceAmount ? parsePrice(priceAmount) : null,
        originalPrice: originalPriceRaw ? parsePrice(originalPriceRaw) : null,
        imageUrl,
      });
    },
    PLATFORM
  );
}

export { scrapeShophiveSearch };

// Quick manual test:
// node -e "import('./shophive.scraper.js').then(m => m.scrapeShophiveSearch('https://www.shophive.com/catalogsearch/result/?q=iphone')).then(r => console.log(JSON.stringify(r, null, 2)))"