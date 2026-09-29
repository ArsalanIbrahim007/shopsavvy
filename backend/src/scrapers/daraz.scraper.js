// daraz.scraper.js
// STATUS: WORKING, but selectors are more fragile than the other scrapers --
// read the note below before touching this file.
//
// Daraz is a React SPA (not server-rendered Magento HTML like most of the
// other platforms), so this goes through the same headless-browser fetch
// (playwrightFetch.js) as iShopping/Paklap. Unlike those two, Daraz's own
// robots.txt explicitly disallows /catalog/ -- the search results path this
// scraper hits. Confirmed live 2026-09-29 that fetching it does NOT trigger
// a CAPTCHA or an explicit bot-block page (real product data comes back
// normally), but the disallow is a deliberate signal from Daraz, unlike the
// other platforms' 403s which are just generic bot-detection. Worth knowing
// before demoing this one, separate from whether it technically works.
//
// Card container (`[data-qa-locator="product-item"]`) and title (`a[title]`)
// are stable, semantic attributes -- unlikely to break on a routine deploy.
// The price element is NOT: Daraz's React build outputs hashed CSS-module
// class names (e.g. "ooOxS") that can change on any frontend redeploy, and
// there's no data-* attribute anywhere marking which span is the price. Price
// extraction therefore has two independent paths -- the current class name
// AND a text-regex fallback that just reads the first "Rs. <amount>" in the
// card -- so a class-name change alone won't silently zero out every price.
// If both ever start failing, check DevTools for the new class name and
// update PRICE_SELECTOR below; the regex fallback needs no changes.

import * as cheerio from "cheerio";
import { fetchHtmlWithBrowser } from "./playwrightFetch.js";
import { parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "daraz";
const BASE_URL = "https://www.daraz.pk";
// Was 3 -- see the matching note in paklap.scraper.js on MAX_PAGES. 1 page
// (~40 listings) is enough for a search result to be useful, and cuts this
// scraper's share of the serialized Playwright queue to a third.
const MAX_PAGES = 1;

// Current class name for the price span, confirmed live 2026-09-29.
// Kept as a best-effort first try; PRICE_TEXT_REGEX is the real safety net.
const PRICE_SELECTOR = ".ooOxS";
const PRICE_TEXT_REGEX = /Rs\.\s?[\d,]+/;

function toAbsoluteUrl(value) {
  if (!value) return null;
  try {
    // Daraz product links are protocol-relative ("//www.daraz.pk/...")
    return new URL(value, BASE_URL).toString();
  } catch {
    return null;
  }
}

function readPrice(card) {
  const bySelector = cleanText(card.find(PRICE_SELECTOR).first().text());
  if (bySelector) {
    const price = parsePrice(bySelector);
    if (price) return price;
  }

  // Fallback: first "Rs. <amount>" found anywhere in the card's text.
  const match = card.text().match(PRICE_TEXT_REGEX);
  return match ? parsePrice(match[0]) : null;
}

function getProductCards($) {
  return $('[data-qa-locator="product-item"]').toArray();
}

async function scrapeDarazSearch(searchUrl) {
  const allListings = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = page === 1 ? searchUrl : `${searchUrl}&page=${page}`;

    const html = await fetchHtmlWithBrowser(pageUrl, {
      waitForSelector: '[data-qa-locator="product-item"]',
      scrollToLoad: true,
    });
    const $ = cheerio.load(html);
    const cards = getProductCards($);

    if (cards.length === 0) break;

    const listings = safeMap(
      cards,
      (el) => {
        const card = $(el);

        const titleLink = card.find("a[title]").first();
        const title = cleanText(titleLink.attr("title")) || cleanText(card.find("img").first().attr("alt"));
        const href = titleLink.attr("href") || card.find('a[href*="/products/"]').first().attr("href");

        if (!title || !href) return null;

        const sourceUrl = toAbsoluteUrl(href);
        if (!sourceUrl) return null;

        const price = readPrice(card);
        if (!price) return null;

        const img = card.find("img").first();
        const imgSrc = img.attr("src") || null;
        // Below-the-fold cards are lazy-loaded -- src is a base64 placeholder
        // until scrolled into view, which this scraper never does.
        const imageUrl = imgSrc && !imgSrc.startsWith("data:") ? toAbsoluteUrl(imgSrc) : null;

        return makeListing({
          platform: PLATFORM,
          sourceUrl,
          title,
          price,
          originalPrice: null,
          imageUrl,
        });
      },
      PLATFORM
    );

    allListings.push(...listings);
  }

  return [
    ...new Map(allListings.map((item) => [item.sourceUrl, item])).values(),
  ];
}

export { scrapeDarazSearch };
