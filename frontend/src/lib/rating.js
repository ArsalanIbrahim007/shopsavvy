// rating.js — what a store's own buyers rated a product, and how much weight that deserves.
//
// The server reads a rating and the number of reviews it rests on from the store's product page (backend ratingPage.service.js), only
// for stores whose pages were checked to give a rating per product (PriceOye today). It is the STORE's rating of its own listing, not
// ours, and many of them rest on one review: PriceOye shows 5.0 from a single review on a large share of its products. So the score is
// shown only when it rests on enough reviews to say something; below that the shopper sees the number of reviews and no score, with
// the exact figure one hover away. A rating with no review count cannot be weighed, so it is not shown at all.

import { platformName } from "./platforms.js";

/** Fewest reviews at which the score itself is shown. */
export const MIN_REVIEWS_TO_SHOW = 5;

const plural = (count) => `${count.toLocaleString("en-US")} ${count === 1 ? "review" : "reviews"}`;

/**
 * @returns {null | {
 *   value: string,        e.g. "4.9"
 *   count: number,
 *   countText: string,    "295 reviews", "1 review"
 *   enough: boolean,      whether the score may be shown
 *   spoken: string,       a full sentence for a screen reader
 *   title: string,        the tooltip: the exact figures, and why a thin score is hidden
 * }}  null when the offer has no usable rating
 */
export function ratingInfo(offer) {
  const rating = Number(offer?.rating);
  const count = Number(offer?.reviewCount);
  if (offer?.rating == null || !Number.isFinite(rating) || rating <= 0 || rating > 5) return null;
  if (offer?.reviewCount == null || !Number.isInteger(count) || count < 1) return null;

  const value = rating.toFixed(1);
  const store = platformName(offer.platform);
  const enough = count >= MIN_REVIEWS_TO_SHOW;
  const countText = plural(count);
  return {
    value,
    count,
    countText,
    enough,
    spoken: enough ? `Rated ${value} out of 5 by ${countText} at ${store}.` : `Only ${countText} at ${store}, too few to rate it.`,
    title: enough
      ? `${store}'s own buyers rated this ${value} out of 5, from ${countText}.`
      : `${store} shows ${value} out of 5, but from ${countText} only. That is too few to say anything, so the score is not shown.`,
  };
}

/**
 * The product's rating, for every store's offer of it: a rating is about the product (a Galaxy A17 is the same phone at every store),
 * so the one resting on the most reviews is shown once for the whole product, saying whose buyers gave it. Only a rating with enough
 * reviews to show (MIN_REVIEWS_TO_SHOW). PriceOye is the only store we read whose pages show ratings (2026-11-09), so without this a
 * product sold at PriceOye and four other stores showed its rating on one row of five, and none on its card.
 * @returns {null | {value: string, count: number, countText: string, store: string, line: string, title: string, spoken: string}}
 */
export function productRating(offers) {
  let best = null;
  for (const offer of offers ?? []) {
    const info = ratingInfo(offer);
    if (info?.enough && (!best || info.count > best.info.count)) best = { offer, info };
  }
  if (!best) return null;
  const store = platformName(best.offer.platform);
  const { value, count, countText } = best.info;
  return {
    value,
    count,
    countText,
    store,
    line: `${value} · ${countText} at ${store}`,
    title: `${store}'s buyers rated this product ${value} out of 5, from ${countText}. It is the same product at every store listed.`,
    spoken: `Rated ${value} out of 5 by ${countText} at ${store}.`,
  };
}
