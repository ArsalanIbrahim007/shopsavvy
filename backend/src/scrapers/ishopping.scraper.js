import * as cheerio from "cheerio";
import { fetchHtmlWithBrowser } from "./playwrightFetch.js";
import { parsePrice, cleanText, safeMap, validatePricePair } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "ishopping";
const BASE_URL = "https://www.ishopping.pk";

function toAbsoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return null;
  }
}

function getProductCards($) {
  const selectors = [
    // Confirmed live 2026-09-29 via headless-browser fetch — the card
    // wrapper is .product-item-info, not .product-item (the classes below
    // don't match current markup at all, kept as a fallback in case the
    // site reverts).
    ".product-item-info",
    "li.item.product.product-item",
    "li.product-item",
    ".products-grid .product-item",
    ".product-item",
  ];

  for (const selector of selectors) {
    const cards = $(selector).toArray();
    if (cards.length > 0) return cards;
  }
  return [];
}

/**
 * Scrapes one iShopping search page.
 * URL format: https://www.ishopping.pk/catalogsearch/result/?q=iphone
 */
async function scrapeIShoppingSearch(searchUrl) {
  const html = await fetchIShoppingHtml(searchUrl);
  const $ = cheerio.load(html);
  const cards = getProductCards($);

  if (cards.length === 0) {
    console.warn(`[${PLATFORM}] no product cards found`);
    return [];
  }

  const listings = safeMap(
    cards,
    (el) => {
      const card = $(el);

      // ── Title + URL ────────────────────────────────────────────────
      let productLink = card.find([
        "a.product-item-link",
        ".product-item-name a",
        ".product.name a",
      ].join(", ")).first();

      let title = cleanText(productLink.text());
      let href = productLink.attr("href");

      if (!title) {
        title = cleanText(
          card.find([".product-item-name", ".product.name"].join(", ")).first().text()
        );
      }

      if (!href) {
        href = card.find("a[href]")
          .filter((_, el) => {
            const candidate = $(el).attr("href") || "";
            return (
              candidate.includes("ishopping.pk") &&
              !candidate.includes("wishlist") &&
              !candidate.includes("compare")
            );
          })
          .first()
          .attr("href");
      }

      if (!title || !href) return null;

      const sourceUrl = toAbsoluteUrl(href);
      if (!sourceUrl) return null;

      // ── Current price ──────────────────────────────────────────────
      // iShopping uses two markup layouts:
      //
      // Layout A (standard Magento, no discount):
      //   <span data-price-type="finalPrice" data-price-amount="119999">
      //
      // Layout B (Was/Now custom layout, with discount):
      //   <span class="info-list--row active">
      //     <span data-price-type="finalPrice" data-price-amount="291">
      //
      // Both expose the value via data-price-amount so the same selectors work.
      const rawPrice = readPrice(card, [
        "[data-price-type='finalPrice'][data-price-amount]",
        ".special-price [data-price-amount]",
        "[data-price-type='finalPrice'] [data-price-amount]",
        ".price-final_price [data-price-amount]",
        ".special-price .price",
        ".price-final_price .price",
        ".price-box .price",
      ]);

      // ── Original / "was" price ─────────────────────────────────────
      // Layout A: no was-price element present.
      // Layout B: <span data-price-type="oldPrice" data-price-amount="323">
      //   The element itself carries data-price-amount (not a child span).
      const rawOriginal = readPrice(card, [
        "[data-price-type='oldPrice'][data-price-amount]",
        "[data-price-type='oldPrice'] [data-price-amount]",
        ".old-price [data-price-amount]",
        "[data-price-type='oldPrice'] .price",
        ".old-price .price",
      ]);

      // Validate the pair: price must be >= 100, was-price must be strictly
      // above price and at most 10x price (catches the Telemart-style misparse
      // where two numbers get joined).
      const { price, originalPrice } = validatePricePair(rawPrice, rawOriginal);
      if (!price) return null;

      // ── Image ──────────────────────────────────────────────────────
      const image = card.find([
        "img.product-image-photo",
        ".product-image-wrapper img",
        ".product-image-container img",
        "img",
      ].join(", ")).first();

      const imageRaw =
        image.attr("data-src") ||
        image.attr("data-original") ||
        image.attr("data-lazy-src") ||
        image.attr("src") ||
        null;

      const imageUrl = toAbsoluteUrl(imageRaw);

      // ── Stock ──────────────────────────────────────────────────────
      const inStock = getStockStatus(card);

      return makeListing({
        platform: PLATFORM,
        sourceUrl,
        title,
        price,
        originalPrice,
        imageUrl,
        inStock,
      });
    },
    PLATFORM
  );

  return listings;
}

export { scrapeIShoppingSearch };

async function fetchIShoppingHtml(url) {
  return fetchHtmlWithBrowser(url, { waitForSelector: ".product-item" });
}

/**
 * Reads a price value from the first matching selector on a card.
 *
 * iShopping puts data-price-amount on the wrapper span itself in the
 * Was/Now layout, so we check the matched element before looking at children.
 */
function readPrice(card, selectors) {
  for (const selector of selectors) {
    const element = card.find(selector).first();
    if (!element.length) continue;

    // data-price-amount may be on the element itself or on a child
    const dataPrice =
      element.attr("data-price-amount") ||
      element.find("[data-price-amount]").first().attr("data-price-amount");

    if (dataPrice) {
      const value = Number(String(dataPrice).replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0) return Math.round(value);
    }

    const text = cleanText(element.text());
    if (!text) continue;

    const price = parsePrice(text);
    if (price !== null && price > 0) return price;
  }
  return null;
}

function getStockStatus(card) {
  const text = cleanText(
    card.find([
      ".stock", ".availability",
      "[class*='stock']", "[class*='availability']",
      ".ddnone",
    ].join(", ")).text()
  ).toLowerCase();

  if (
    text.includes("out of stock") ||
    text.includes("sold out") ||
    text.includes("unavailable")
  ) {
    return false;
  }
  return true;
}