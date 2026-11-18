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

/**
 * Whether a card's product can be bought, from the marks PriceOye puts on it (2026-11-18): a "COMING SOON" ribbon (not on sale yet:
 * the price is only the expected one, and the product page has no buy button), a "DISCONTINUED" ribbon (its last price, not sold any
 * more) and an out-of-stock label. Every card was read as in stock before, so a coming-soon TCL TV showed "In stock" and "Buy now",
 * and a discontinued Haier AC was the lowest price of its kind. Null when the card has none of them.
 */
export function cardAvailability(card) {
  if (card.find(".ribbon_coming_soon").length) return "coming_soon";
  if (card.find(".ribbon_discontinued").length) return "discontinued";
  if (card.find(".out-of-stock-label").length) return "out_of_stock";
  return null;
}

/** Every product card on a PriceOye page (search or category), as listings. */
export function parsePriceOyeCards(html) {
  const $ = cheerio.load(html);
  // Each result was an <a class="product-card">; since about 2026-11-08 it is the link inside a <div class="productBox">, and the
  // scraper found nothing (every PriceOye search came back empty). Both layouts are read; the title and price classes are the same.
  const cards = $("a.product-card, .productBox > a").toArray();
  return safeMap(
    cards,
    (el) => {
      const card = $(el);
      const title = cleanText(card.find(".p-title").text());
      const href = card.attr("href");
      if (!title || !href) return null;
      const availability = cardAvailability(card);
      return makeListing({
        platform: PLATFORM,
        sourceUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
        title,
        price: parsePrice(card.find(".price-box").text()),
        originalPrice: parsePrice(card.find(".price-diff-retail").text()),
        imageUrl: card.find("amp-img.product-thumbnail").first().attr("src") || card.find("img.product-thumbnail").first().attr("src") || null,
        inStock: availability === null,
        availability,
        ...cardRating(card),
      });
    },
    PLATFORM
  );
}

async function scrapePriceOyeSearch(searchUrl) {
  const allListings = [];
  const MAX_PAGES = 5;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = searchUrl.includes("?") ? "&" : "?";
    const pageUrl = page === 1 ? searchUrl : `${searchUrl}${separator}page=${page}`;
    const listings = parsePriceOyeCards(await fetchHtml(pageUrl));
    if (listings.length === 0) break;
    allListings.push(...listings);
  }

  // remove duplicates if pages overlap
  return [...new Map(allListings.map((item) => [item.sourceUrl, item])).values()];
}

// A section's pages: /mobiles, /mobiles?page=2, ... PriceOye's robots.txt allows "?page=" for every crawler (it disallows other query
// strings, such as /search?q=, for crawlers it does not name).
export const SECTION_MAX_PAGES = 120; // a guard: its largest section, mobiles, has about 60 pages of 36

/**
 * One PriceOye section (the first part of a product's address: "mobiles", "led-tv", "ac") read page by page, as pages of listings,
 * for the catalogue refresh (catalogue.js). Stops at the first page with no cards, or one that brings nothing new.
 */
export async function* priceOyeSection(section, { fetch = fetchHtml, maxPages = SECTION_MAX_PAGES, onError } = {}) {
  const seen = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? `${BASE_URL}/${section}` : `${BASE_URL}/${section}?page=${page}`;
    let listings;
    try {
      listings = parsePriceOyeCards(await fetch(url));
    } catch (error) {
      onError?.({ error: new Error(`${url}: ${error.message}`) });
      return;
    }
    const fresh = listings.filter((l) => !seen.has(l.sourceUrl));
    if (fresh.length === 0) return;
    fresh.forEach((l) => seen.add(l.sourceUrl));
    yield fresh;
    if (page === maxPages) onError?.({ error: new Error(`${section}: stopped at ${maxPages} pages`) });
  }
}

export { scrapePriceOyeSearch };
