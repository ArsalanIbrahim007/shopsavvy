// ratingPage.service.js — the rating buyers gave a product, read from a store's own product page. Pure: HTML in, { rating, reviewCount }
// out; fetching and saving live in pageEnrichment.service.js.
//
// One reader per store, and only for stores whose pages were checked by reading pages of different products (2026-10-08):
//   - PriceOye shows the real average and the number of reviews in the page's rating block (".po-rating-section": "4.9", "295 Reviews").
//     Its structured data (schema.org aggregateRating) is NOT used: it says ratingValue 5 on every product, whatever the visible
//     rating is (4.9, 4.8, 4.5, 4.0 on the pages compared), so it would have shown a 5.0 that no buyer gave.
//   - Mega publishes aggregateRating 4.5 from 1,341 ratings on every product it sells (a phone, a TV and a laptop alike).
//   - iShopping writes "aggregateRating":"0"; Shophive, Paklap, Telemart, eezepc and w11stop publish no rating.
//   - Audionic, Zero, Ronin, Baseus, MiStore and MyMart (Shopify) show buyers' reviews with the Judge.me app (checked 2026-11-09, two
//     or more products each). Its product review widget ("#judgeme_product_reviews", data-shop-reviews="false": the product's reviews,
//     not the shop's) carries the product's average and count in its HTML, and they differ product by product (Audionic 4.98 from
//     21,924 and 4.86 from 29; Zero 4.91 from 85 and 4.82 from 202; Ronin 4.71 from 55 and 4.76 from 25; a product without reviews
//     says 0.00 from 0). The small star badges elsewhere on the page are other products' (a carousel), so only the widget is read.
// So a rating from a store without a reader here is never taken. A store gets a reader after the same check.
//
// Many PriceOye products show 5.0 from a single review, which is little to go on: the count is kept with the rating so that what is
// shown can say how many it rests on.

import * as cheerio from "cheerio";

import { normalizeRating, normalizeReviewCount } from "./scrapedExtras.service.js";

/**
 * @param {string} html  a PriceOye product page
 * @returns {{rating: number, reviewCount: number}|null}  rating on a 0-5 scale (one decimal) and how many reviews it rests on; null when the page shows none
 */
export function extractPriceOyeRating(html) {
  const page = String(html ?? "");
  if (!page.includes("po-rating-section")) return null;

  const section = cheerio.load(page)(".po-rating-section").first(); // the product's own rating, not a list of reviews further down
  const rating = normalizeRating(section.find(".rating-points").first().text().trim());
  const count = /^(\d[\d,]*)\s+reviews?$/i.exec(section.find(".rating-count").first().text().trim());
  const reviewCount = count ? normalizeReviewCount(count[1]) : null;

  if (rating === null || reviewCount === null || reviewCount < 1) return null;
  return { rating, reviewCount };
}

/**
 * @param {string} html  a product page of a Shopify store that uses Judge.me (RATING_READERS in pageEnrichment.service.js)
 * @returns {{rating: number, reviewCount: number}|null}  the product's own average (one decimal) and count; null without reviews
 */
export function extractJudgeMeRating(html) {
  const page = String(html ?? "");
  if (!page.includes("judgeme_product_reviews")) return null;

  const widget = cheerio.load(page)("#judgeme_product_reviews").first();
  if (String(widget.attr("data-shop-reviews") ?? "false").toLowerCase() === "true") return null; // the shop's reviews, not this product's
  const summary = widget.find(".jdgm-rev-widg").first();
  const rating = normalizeRating(summary.attr("data-average-rating"));
  const reviewCount = normalizeReviewCount(summary.attr("data-number-of-reviews"));

  if (rating === null || reviewCount === null || reviewCount < 1) return null;
  return { rating, reviewCount };
}
