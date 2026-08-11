// mega.scraper.js
//
// STATUS: WORKING (selectors confirmed via DevTools, June 2026).
// Mega serves product data as static HTML — Axios + Cheerio works fine.
// Real search URL pattern: https://www.mega.pk/search/{query}/
// (NOT a query-string pattern — confirmed by testing in browser.)

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "mega";
const BASE_URL = "https://www.mega.pk";

/**
 * Scrapes a single Mega.pk search/category page.
 * @param {string} searchUrl
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeMegaSearch(searchUrl) {
  const allListings = [];
  const MAX_PAGES = 5;

  // Example:
  // https://www.mega.pk/search/samsung/
  const baseSearchUrl = searchUrl.endsWith("/")
    ? searchUrl
    : `${searchUrl}/`;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl =
      page === 1
        ? baseSearchUrl
        : `${baseSearchUrl}${page}/`;

    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);

    const cards = $("li[data-brand]").toArray();

    console.log(
      `[mega] page ${page}: ${cards.length} cards`
    );

    if (cards.length === 0) {
      break;
    }

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        const title = cleanText(
          card.find("#lap_name_div h3 a").text()
        );

        const href = card
          .find("#lap_name_div h3 a")
          .attr("href");

        const imageUrl =
          card.find(".image img").attr("src") ||
          null;

        const brand =
          card.attr("data-brand") ||
          null;

        const priceBox = card
          .find(".cat_price")
          .clone();

        const originalPriceRaw =
          priceBox.find(".was").text();

        priceBox.find(".was").remove();

        const priceRaw = priceBox.text();

        if (!title || !href) {
          return null;
        }

        const sourceUrl = href.startsWith("http")
          ? href
          : `${BASE_URL}${href}`;

        return makeListing({
          platform: PLATFORM,
          sourceUrl,
          title,
          price: parsePrice(priceRaw),
          originalPrice:
            parsePrice(originalPriceRaw) || null,
          imageUrl,
          brand,
        });
      },
      PLATFORM
    );

    allListings.push(...listings);
  }

  return [
    ...new Map(
      allListings.map((item) => [
        item.sourceUrl,
        item,
      ])
    ).values(),
  ];
}

export { scrapeMegaSearch };

// Quick manual test:
// node -e "import('./mega.scraper.js').then(m => m.scrapeMegaSearch('https://www.mega.pk/search/iphone/')).then(r => console.log(JSON.stringify(r, null, 2)))"