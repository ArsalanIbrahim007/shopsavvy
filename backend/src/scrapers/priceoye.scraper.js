// priceoye.scraper.js

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "priceoye";
const BASE_URL = "https://priceoye.pk";

async function scrapePriceOyeSearch(searchUrl) {
  const allListings = [];
  const MAX_PAGES = 5;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = searchUrl.includes("?") ? "&" : "?";
    const pageUrl =
      page === 1
        ? searchUrl
        : `${searchUrl}${separator}page=${page}`;

    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);

    const cards = $("a.product-card").toArray();

    if (cards.length === 0) {
      break;
    }

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        const title = cleanText(card.find(".p-title").text());
        const priceRaw = card.find(".price-box").text();
        const originalPriceRaw = card.find(".price-diff-retail").text();
        const href = card.attr("href");

        const imageUrl =
          card.find("amp-img.product-thumbnail").first().attr("src") ||
          card.find("img.product-thumbnail").first().attr("src") ||
          null;

        if (!title || !href) return null;

        const sourceUrl = href.startsWith("http")
          ? href
          : `${BASE_URL}${href}`;

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

    allListings.push(...listings);
  }

  // remove duplicates if pages overlap
  return [
    ...new Map(
      allListings.map((item) => [item.sourceUrl, item])
    ).values(),
  ];
}

export { scrapePriceOyeSearch };