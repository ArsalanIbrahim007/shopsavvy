// ishopping.scraper.js
//
// Dedicated scraper for iShopping.pk.
//
// iShopping serves product data in HTML, so the scraper still uses
// Axios + Cheerio like PriceOye, Mega and Shophive.
//
// Difference:
// iShopping may reject a direct search-page request with HTTP 403.
// Therefore we first visit the homepage, collect any session cookies,
// then request the search page using the same browser-like session.

import axios from "axios";
import * as cheerio from "cheerio";

import {
  parsePrice,
  cleanText,
  safeMap,
} from "./scraper.utils.js";

import { makeListing } from "./scraper.schema.js";

const PLATFORM = "ishopping";
const BASE_URL = "https://www.ishopping.pk";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",

  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",

  "Accept-Language": "en-US,en;q=0.9",

  "Cache-Control": "no-cache",

  Pragma: "no-cache",

  "Upgrade-Insecure-Requests": "1",
};

/**
 * Convert relative URLs to absolute URLs.
 */
function toAbsoluteUrl(value) {
  if (!value) return null;

  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return null;
  }
}

/**
 * iShopping-specific HTML fetch.
 *
 * Step 1:
 * Open homepage and collect any cookies.
 *
 * Step 2:
 * Request search page with those cookies.
 *
 * No extra npm packages required.
 */
async function fetchIShoppingHtml(url) {
  const client = axios.create({
    timeout: 15000,
    maxRedirects: 5,
    headers: HEADERS,
    responseType: "text",
  });

  let cookieHeader = "";

  try {
    const homeResponse = await client.get(`${BASE_URL}/`, {
      headers: {
        ...HEADERS,
        Referer: BASE_URL,
      },
    });

    const cookies = homeResponse.headers["set-cookie"] || [];

    cookieHeader = cookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  } catch (err) {
    console.warn(
      `[${PLATFORM}] homepage session request failed: ${err.message}`
    );
  }

  try {
    const response = await client.get(url, {
      headers: {
        ...HEADERS,

        Referer: `${BASE_URL}/`,

        ...(cookieHeader
          ? {
              Cookie: cookieHeader,
            }
          : {}),
      },
    });

    return response.data;
  } catch (err) {
    const status = err.response?.status;

    throw new Error(
      status
        ? `iShopping request failed with HTTP ${status}`
        : `iShopping request failed: ${err.message}`
    );
  }
}

/**
 * Reads numeric price from Magento/iShopping markup.
 *
 * Prefer data-price-amount where possible.
 */
function readPrice(card, selectors) {
  for (const selector of selectors) {
    const element = card.find(selector).first();

    if (!element.length) continue;

    const dataPrice = element.attr("data-price-amount");

    if (dataPrice) {
      const value = Number(
        String(dataPrice).replace(/,/g, "")
      );

      if (Number.isFinite(value)) {
        return Math.round(value);
      }
    }

    const text = cleanText(element.text());

    if (!text) continue;

    const price = parsePrice(text);

    if (price !== null) {
      return price;
    }
  }

  return null;
}

/**
 * Get stock status.
 */
function getStockStatus(card) {
  const text = cleanText(
    card
      .find(
        [
          ".stock",
          ".availability",
          "[class*='stock']",
          "[class*='availability']",
        ].join(", ")
      )
      .text()
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

/**
 * Find product cards.
 */
function getProductCards($) {
  const selectors = [
    "li.item.product.product-item",
    "li.product-item",
    ".products-grid .product-item",
    ".product-item",
  ];

  for (const selector of selectors) {
    const cards = $(selector).toArray();

    if (cards.length > 0) {
      console.log(
        `[${PLATFORM}] selector "${selector}" found ${cards.length} cards`
      );

      return cards;
    }
  }

  return [];
}

/**
 * Scrapes one iShopping search page.
 *
 * Example:
 * https://www.ishopping.pk/catalogsearch/result/?q=samsung
 */
async function scrapeIShoppingSearch(searchUrl) {
  const html = await fetchIShoppingHtml(searchUrl);

  const $ = cheerio.load(html);

  const cards = getProductCards($);

  if (cards.length === 0) {
    console.warn(
      `[${PLATFORM}] request succeeded but no product cards were found`
    );

    return [];
  }

  const listings = safeMap(
    cards,

    (el) => {
      const card = $(el);

      // -----------------------------------------------
      // PRODUCT TITLE + URL
      // -----------------------------------------------

      let productLink = card
        .find(
          [
            "a.product-item-link",
            ".product-item-name a",
            ".product.name a",
          ].join(", ")
        )
        .first();

      let title = cleanText(productLink.text());

      let href = productLink.attr("href");

      // Fallback for themes where name/link structure differs.
      if (!title) {
        title = cleanText(
          card
            .find(
              [
                ".product-item-name",
                ".product.name",
              ].join(", ")
            )
            .first()
            .text()
        );
      }

      if (!href) {
        href = card
          .find("a[href]")
          .filter((_, el) => {
            const candidate =
              $(el).attr("href") || "";

            return (
              candidate.includes("ishopping.pk") &&
              !candidate.includes("wishlist") &&
              !candidate.includes("compare")
            );
          })
          .first()
          .attr("href");
      }

      if (!title || !href) {
        return null;
      }

      const sourceUrl = toAbsoluteUrl(href);

      if (!sourceUrl) {
        return null;
      }

      // -----------------------------------------------
      // CURRENT PRICE
      // -----------------------------------------------

      const price = readPrice(card, [
        ".special-price [data-price-amount]",

        "[data-price-type='finalPrice'] [data-price-amount]",

        ".price-final_price [data-price-amount]",

        ".special-price .price",

        ".price-final_price .price",

        ".price-box .price",
      ]);

      // A product without a valid price is not useful
      // to ShopSavvy.
      if (!price) {
        return null;
      }

      // -----------------------------------------------
      // ORIGINAL PRICE
      // -----------------------------------------------

      const detectedOriginalPrice = readPrice(card, [
        ".old-price [data-price-amount]",

        "[data-price-type='oldPrice'] [data-price-amount]",

        ".old-price .price",

        "[data-price-type='oldPrice'] .price",
      ]);

      const originalPrice =
        detectedOriginalPrice &&
        detectedOriginalPrice > price
          ? detectedOriginalPrice
          : null;

      // -----------------------------------------------
      // IMAGE
      // -----------------------------------------------

      const image = card
        .find(
          [
            "img.product-image-photo",
            ".product-image-wrapper img",
            ".product-image-container img",
            "img",
          ].join(", ")
        )
        .first();

      const imageRaw =
        image.attr("data-src") ||
        image.attr("data-original") ||
        image.attr("data-lazy-src") ||
        image.attr("src") ||
        null;

      const imageUrl = toAbsoluteUrl(imageRaw);

      // -----------------------------------------------
      // STOCK
      // -----------------------------------------------

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

  console.log(
    `[${PLATFORM}] parsed ${listings.length}/${cards.length} cards`
  );

  return listings;
}

export {
  scrapeIShoppingSearch,
};