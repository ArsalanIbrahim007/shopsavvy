// priceoye.scraper.js

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "priceoye";
const BASE_URL = "https://priceoye.pk";

/**
 * The rating on a search card: "★ 4.9 · 11 Reviews" is <div class="user-rating-box">…<span class="h6">4.9</span><span class="p6 space">11</span>.
 * A card without reviews has an empty box. PriceOye is the only store we read whose search shows ratings (2026-11-09: 17 of 24
 * cards for "redmi note 15"); the new layout of 2026-11-08 had stopped them being read.
 */
export function cardRating(card) {
  const box = card.find(".user-rating-box");
  const rating = Number.parseFloat(box.find(".h6").first().text());
  const reviews = Number.parseInt(box.find(".p6.space").first().text().replace(/[^\d]/g, ""), 10);
  if (!(rating > 0 && rating <= 5) || !(reviews > 0)) return {};
  return { rating, reviewCount: reviews };
}

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

    // Each result was an <a class="product-card">; since about 2026-11-08 it is the link inside a <div class="productBox">, and the
    // scraper found nothing (every PriceOye search came back empty). Both layouts are read; the title and price classes are the same.
    const cards = $("a.product-card, .productBox > a").toArray();

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
          ...cardRating(card),
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