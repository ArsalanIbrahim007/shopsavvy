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
  const allListings = [];
  const MAX_PAGES = 5;

  const parsedUrl = new URL(searchUrl);
  const query = parsedUrl.searchParams.get("q");

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl =
      page === 1
        ? searchUrl
        : `${BASE_URL}/catalogsearch/result/index/?p=${page}&q=${encodeURIComponent(query)}`;

    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);

    const cards = $("li.product-item").toArray();

    console.log(
      `[shophive] page ${page}: ${cards.length} cards`
    );

    if (cards.length === 0) {
      break;
    }

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        const titleLink = card.find(".product-item-link");
        const title = cleanText(titleLink.text());
        const href = titleLink.attr("href");

        const image = card
          .find("img.product-image-photo")
          .first();

        const imageUrl =
          image.attr("data-src") ||
          image.attr("data-lazy-src") ||
          image.attr("data-original") ||
          image.attr("src") ||
          image
            .attr("srcset")
            ?.split(",")[0]
            ?.trim()
            .split(" ")[0] ||
          null;

        const priceAmount = card
          .find("[data-price-amount]")
          .first()
          .attr("data-price-amount");

        const originalPriceRaw = card
          .find(".old-price .price")
          .first()
          .text();

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
          price: priceAmount
            ? parsePrice(priceAmount)
            : null,
          originalPrice: originalPriceRaw
            ? parsePrice(originalPriceRaw)
            : null,
          imageUrl,
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

export { scrapeShophiveSearch };

// Quick manual test:
// node -e "import('./shophive.scraper.js').then(m => m.scrapeShophiveSearch('https://www.shophive.com/catalogsearch/result/?q=iphone')).then(r => console.log(JSON.stringify(r, null, 2)))"