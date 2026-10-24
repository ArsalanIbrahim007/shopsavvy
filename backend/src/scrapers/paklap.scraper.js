// paklap.scraper.js
// STATUS: WORKING (selectors confirmed via DevTools inspection)
// Paklap.pk is a Magento storefront serving static HTML, but 403s every
// plain axios request (confirmed 2026-09-29, no header combination gets
// past it). Fetches go through a real headless browser instead
// (playwrightFetch.js); selectors/parsing below are unchanged.
// Search URL pattern: https://www.paklap.pk/catalogsearch/result/index/?cat=0&q={query}

import * as cheerio from "cheerio";
import { fetchHtmlWithBrowser, createScraperContext } from "./playwrightFetch.js";
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

  // Reuse one browser context across both page fetches so we pay the
  // context-creation cost once instead of twice. The queue in
  // playwrightFetch.js still serialises the fetches; this only removes
  // the per-fetch context startup overhead (~200-400 ms each).
  const context = await createScraperContext();

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageUrl =
        page === 1
          ? searchUrl
          : `${searchUrl}&p=${page}`;

      const html = await fetchHtmlWithBrowser(pageUrl, {
        waitForSelector: ".product-item",
        context,
      });

      const $ = cheerio.load(html);
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

          // Current price
          const priceEl = card
            .find("[data-price-type='finalPrice'][data-price-amount]")
            .first();
          const priceAmount = priceEl.attr("data-price-amount");
          const rawPrice = priceAmount ? parsePrice(priceAmount) : null;

          // Original price (if discounted)
          const originalPriceEl = card
            .find("[data-price-type='oldPrice'][data-price-amount]")
            .first();
          const originalPriceAmount = originalPriceEl.attr("data-price-amount");
          const rawOriginal = originalPriceAmount
            ? parsePrice(originalPriceAmount)
            : null;

          // Validate the pair -- was-price must be above price and under 10x
          const price = rawPrice && rawPrice > 0 ? rawPrice : null;
          if (!price) return null;
          const originalPrice =
            rawOriginal && rawOriginal > price ? rawOriginal : null;

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
  } finally {
    // Always close the context even if a page fetch throws, so we don't
    // leak browser resources.
    await context.close().catch(() => {});
  }

  // Deduplicate by sourceUrl
  return [
    ...new Map(
      allListings.map((item) => [item.sourceUrl, item])
    ).values(),
  ];
}

export { scrapePaklapSearch };