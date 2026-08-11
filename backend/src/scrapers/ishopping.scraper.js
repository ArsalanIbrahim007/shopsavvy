// ishopping.scraper.js
//
// Dedicated scraper for iShopping.pk.
// iShopping uses Magento and serves static HTML — Axios + Cheerio works.
// However it returns 403 without proper browser simulation.
// Fix: visit homepage first to get session cookies, then hit search page
// with realistic browser headers including sec-fetch and sec-ch-ua headers.

import axios from "axios";
import * as cheerio from "cheerio";
import { parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "ishopping";
const BASE_URL = "https://www.ishopping.pk";

// Full browser-like headers including sec-fetch headers that real Chrome sends
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Connection": "keep-alive",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return null;
  }
}

/**
 * Fetches iShopping HTML with proper browser simulation.
 * Step 1: Visit homepage to collect session cookies
 * Step 2: Wait briefly (like a real user)
 * Step 3: Request search page with cookies + Referer
 */
async function fetchIShoppingHtml(url) {
  const client = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    responseType: "text",
    // Keep cookies across requests
    withCredentials: true,
  });

  let cookieHeader = "";

  // Step 1: Visit homepage to get session cookies
  try {
    const homeResponse = await client.get(`${BASE_URL}/`, {
      headers: {
        ...HEADERS,
        "Sec-Fetch-Site": "none", // first navigation has no referrer site
      },
    });

    const setCookies = homeResponse.headers["set-cookie"] || [];
    cookieHeader = setCookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

  } catch (err) {
    console.warn(`[${PLATFORM}] homepage visit failed: ${err.message}`);
    // Continue anyway — some servers set cookies via JS, not headers
  }

  // Step 2: Small delay to look like a real user browsing
  await sleep(800 + Math.random() * 400);

  // Step 3: Request search page with cookies + Referer
  try {
    const response = await client.get(url, {
      headers: {
        ...HEADERS,
        "Referer": `${BASE_URL}/`,
        "Sec-Fetch-Site": "same-origin",
        ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
      },
    });

    return response.data;
  } catch (err) {
    const status = err.response?.status;
    throw new Error(
      status
        ? `iShopping returned HTTP ${status} for: ${url}`
        : `iShopping request failed: ${err.message}`
    );
  }
}

function readPrice(card, selectors) {
  for (const selector of selectors) {
    const element = card.find(selector).first();
    if (!element.length) continue;

    const dataPrice = element.attr("data-price-amount");
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

function getProductCards($) {
  const selectors = [
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

      // Title + URL
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

      // Current price
      const price = readPrice(card, [
        ".special-price [data-price-amount]",
        "[data-price-type='finalPrice'] [data-price-amount]",
        ".price-final_price [data-price-amount]",
        ".special-price .price",
        ".price-final_price .price",
        ".price-box .price",
      ]);

      if (!price) return null;

      // Original price
      const detectedOriginalPrice = readPrice(card, [
        ".old-price [data-price-amount]",
        "[data-price-type='oldPrice'] [data-price-amount]",
        ".old-price .price",
        "[data-price-type='oldPrice'] .price",
      ]);

      const originalPrice =
        detectedOriginalPrice && detectedOriginalPrice > price
          ? detectedOriginalPrice
          : null;

      // Image
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