// w11stop.scraper.js
// STATUS: WORKING (selectors confirmed via DevTools inspection)
// W11Stop.com runs OpenCart — different selector structure from Magento sites.
// Search URL: https://w11stop.com/search?search={query}
// Pagination:  https://w11stop.com/search?search={query}&page=2

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "w11stop";
const BASE_URL = "https://w11stop.com";

async function scrapeW11StopSearch(searchUrl) {
  const allListings = [];
  const MAX_PAGES = 5;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl =
      page === 1
        ? searchUrl
        : `${searchUrl}&page=${page}`;

    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);

    // OpenCart product grid — confirmed 20 cards per page
    const cards = $(".product-layout").toArray();

    if (cards.length === 0) break;

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        // Title + URL
        const titleLink = card.find(".name a").first();
        const title = cleanText(titleLink.text());
        const href = titleLink.attr("href");

        if (!title || !href) return null;

        // Strip search params W11Stop appends to product URLs
        // e.g. /samsung-galaxy?search=samsung&page=2 → /samsung-galaxy
        const cleanHref = href.split("?")[0];
        const sourceUrl = cleanHref.startsWith("http")
          ? cleanHref
          : `${BASE_URL}${cleanHref}`;

        // Price — OpenCart: .price-new = current, .price-old = original
        const priceRaw = card.find(".price-new").first().text();
        const price = parsePrice(priceRaw);

        if (!price) return null;

        const originalPriceRaw = card.find(".price-old").first().text();
        const originalPriceParsed = parsePrice(originalPriceRaw);

        // Only keep original if genuinely higher than current price
        const originalPrice =
          originalPriceParsed && originalPriceParsed > price
            ? originalPriceParsed
            : null;

        // Image — W11Stop uses lazy loading, real URL is in data-src
        // src initially contains a base64 placeholder, skip it
        const img = card.find("img").first();
        const imageRaw =
          img.attr("data-src") ||
          img.attr("src") ||
          null;

        const imageUrl =
          imageRaw && !imageRaw.startsWith("data:")
            ? imageRaw.startsWith("http")
              ? imageRaw
              : `${BASE_URL}${imageRaw}`
            : null;

        // Brand — W11Stop provides it in .stat-1
        const brandText =
          card.find(".stat-1 span:last-child a").text().trim() ||
          card.find(".stat-1 span:last-child").text().trim();
        const brand = brandText || null;

        return makeListing({
          platform: PLATFORM,
          sourceUrl,
          title,
          price,
          originalPrice,
          imageUrl,
          brand,
        });
      },
      PLATFORM
    );

    allListings.push(...listings);
  }

  // Deduplicate by sourceUrl (clean URLs now, so this works correctly)
  return [
    ...new Map(
      allListings.map((item) => [item.sourceUrl, item])
    ).values(),
  ];
}

export { scrapeW11StopSearch };

// Quick test:
// node -e "import('./w11stop.scraper.js').then(m => m.scrapeW11StopSearch('https://w11stop.com/search?search=samsung')).then(r => { console.log('Total:', r.length); console.log(JSON.stringify(r.slice(0,2), null, 2)); })"