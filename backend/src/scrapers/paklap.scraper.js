// paklap.scraper.js
// STATUS: WORKING (selectors confirmed via DevTools inspection)
// Paklap.pk is a Magento storefront serving static HTML, but 403s every
// plain axios request (confirmed 2026-09-29, no header combination gets
// past it). Fetches go through a real headless browser instead
// (playwrightFetch.js); selectors/parsing below are unchanged.
// Search URL pattern: https://www.paklap.pk/catalogsearch/result/index/?cat=0&q={query}

import * as cheerio from "cheerio";
import { fetchHtmlWithBrowser } from "./playwrightFetch.js";
import { parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "paklap";
const BASE_URL = "https://www.paklap.pk";

async function scrapePaklapSearch(searchUrl) {
  const allListings = [];
  // Was 5 -- each page is a full Playwright navigation serialized against
  // iShopping/Daraz through one shared browser (see playwrightFetch.js).
  // Confirmed live 2026-09-29 that several concurrent live searches (e.g.
  // the homepage's background category fetches) piling up on that queue
  // made a single search take minutes. 2 pages keeps most of the coverage
  // at under half the serialized cost.
  const MAX_PAGES = 2;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl =
      page === 1
        ? searchUrl
        : `${searchUrl}&p=${page}`;

    const html = await fetchHtmlWithBrowser(pageUrl, { waitForSelector: ".product-item" });
    const $ = cheerio.load(html);

    // Magento product grid items
    const cards = $("li.product-item").toArray();

    if (cards.length === 0) break;

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        // Title + URL
        const titleLink = card.find("a.product-item-link").first();
        const title = cleanText(titleLink.text());
        const href = titleLink.attr("href");

        if (!title || !href) return null;

        const sourceUrl = href.startsWith("http")
          ? href
          : `${BASE_URL}${href}`;

        // Price — Magento exposes clean numeric via data-price-amount.
        // data-price-amount and data-price-type live on the SAME element
        // (confirmed live 2026-09-29), not parent/child, so this must be a
        // compound selector, not a descendant one.
        const priceEl = card
          .find("[data-price-type='finalPrice'][data-price-amount]")
          .first();
        const priceAmount = priceEl.attr("data-price-amount");
        const price = priceAmount ? parsePrice(priceAmount) : null;

        if (!price) return null;

        // Original price (if discounted)
        const originalPriceEl = card
          .find("[data-price-type='oldPrice'][data-price-amount]")
          .first();
        const originalPriceAmount = originalPriceEl.attr("data-price-amount");
        const originalPrice =
          originalPriceAmount && parsePrice(originalPriceAmount) > price
            ? parsePrice(originalPriceAmount)
            : null;

        // Image
        const img = card.find("img.product-image-photo").first();
        const imageUrl =
          img.attr("data-src") ||
          img.attr("src") ||
          null;

        return makeListing({
          platform: PLATFORM,
          sourceUrl,
          title,
          price,
          originalPrice,
          imageUrl: imageUrl
            ? imageUrl.startsWith("http")
              ? imageUrl
              : `${BASE_URL}${imageUrl}`
            : null,
        });
      },
      PLATFORM
    );

    allListings.push(...listings);
  }

  // Deduplicate by sourceUrl
  return [
    ...new Map(
      allListings.map((item) => [item.sourceUrl, item])
    ).values(),
  ];
}

export { scrapePaklapSearch };

// Quick test:
// node -e "import('./paklap.scraper.js').then(m => m.scrapePaklapSearch('https://www.paklap.pk/catalogsearch/result/index/?cat=0&q=samsung')).then(r => console.log(JSON.stringify(r.slice(0,2), null, 2)))"