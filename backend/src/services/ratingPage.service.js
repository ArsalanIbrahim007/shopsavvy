// ratingPage.service.js — the rating buyers gave a product, read from a store's own product page. Pure: HTML in, { rating, reviewCount }
// out; fetching and saving live in pageEnrichment.service.js.
//
// One reader per store, and only for stores whose pages were checked by reading pages of different products (2026-10-08):
//   - PriceOye shows the real average and the number of reviews in the page's rating block (".po-rating-section": "4.9", "295 Reviews").
//     Its structured data (schema.org aggregateRating) is NOT used: it says ratingValue 5 on every product, whatever the visible
//     rating is (4.9, 4.8, 4.5, 4.0 on the pages compared), so it would have shown a 5.0 that no buyer gave.
//   - Mega publishes aggregateRating 4.5 from 1,341 ratings on every product it sells (a phone, a TV and a laptop alike).
//   - iShopping writes "aggregateRating":"0"; Shophive, Paklap, Telemart, eezepc and w11stop publish no rating.
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
