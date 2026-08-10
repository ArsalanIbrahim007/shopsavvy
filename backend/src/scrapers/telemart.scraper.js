// telemart.scraper.js
//
// STATUS: WORKING — selectors based on Telemart product-card HTML.
//
// Telemart uses Shopify-style server-rendered HTML, so Axios + Cheerio
// should be sufficient for scraping listing/search pages without a
// headless browser.

import * as cheerio from "cheerio";
import {
  fetchHtml,
  parsePrice,
  cleanText,
  safeMap,
} from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "telemart";
const BASE_URL = "https://www.telemart.pk";

/**
 * Scrapes a single Telemart search/category page.
 *
 * @param {string} searchUrl - Full URL to a Telemart search/category page.
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeTelemartSearch(searchUrl) {
  const html = await fetchHtml(searchUrl);
  const $ = cheerio.load(html);

  // Telemart uses Shopify-style product grid items.
  const cards = $(".grid-view-item").toArray();

  return safeMap(
    cards,
    (el) => {
      const card = $(el);

      // Product title
      const title = cleanText(
        card.find(".grid-view-item__title a").first().text()
      );

      // Product URL
      const href = card
        .find(".grid-view-item__title a")
        .first()
        .attr("href");

      // Current/sale price
      //
      // The original price is inside:
      // <s class="product-price__price compare_price">
      //
      // Therefore target the non-struck-through price specifically.
      const priceRaw = card
        .find(".grid-view-item__meta .product-price__price")
        .not(".compare_price")
        .first()
        .text();

      // Original price
      const originalPriceRaw = card
        .find(".grid-view-item__meta s.compare_price")
        .first()
        .text();

      // Product image
      //
      // Use the featured image rather than the image_thumb_swap
      // (which is Telemart's hover/secondary product image).
      const imageUrl =
        card.find("img.grid-view-item__image").first().attr("src") ||
        null;

      if (!title || !href) return null;

      // Telemart product hrefs are relative, e.g.
      // /collections/mobiles-tablets/products/xiaomi-redmi-a5...
      const sourceUrl = href.startsWith("http")
        ? href
        : `${BASE_URL}${href}`;

      // Telemart's Shopify CDN uses protocol-relative image URLs:
      // //www.telemart.pk/cdn/shop/files/...
      //
      // Convert them to a normal HTTPS URL.
      const normalizedImageUrl = imageUrl
        ? imageUrl.startsWith("//")
          ? `https:${imageUrl}`
          : imageUrl
        : null;

      return makeListing({
        platform: PLATFORM,
        sourceUrl,
        title,
        price: parsePrice(priceRaw),
        originalPrice: parsePrice(originalPriceRaw),
        imageUrl: normalizedImageUrl,
      });
    },
    PLATFORM
  );
}

export { scrapeTelemartSearch };

// Quick manual test:
//
// node -e "import('./telemart.scraper.js').then(m => m.scrapeTelemartSearch('https://www.telemart.pk/collections/mobiles-tablets')).then(r => console.log(JSON.stringify(r, null, 2)))"
