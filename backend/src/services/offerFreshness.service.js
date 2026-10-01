// offerFreshness.service.js — an offer whose price has not been checked for a long time is not "the lowest price".
//
// Scraping here is search-driven: a listing is refreshed only when a query happens to return it. On 2026-10-01, 177 stored listings
// (all from the first scrapes in August) had not been checked for over 30 days and were still shown, 19 of the top 300 products
// had one of them as "the lowest price". A price that old may no longer be on the store, or may have changed.
//
// So an offer last checked more than STALE_AFTER_DAYS ago is "out of date": it stays in the list, labelled, but is left out of the
// lowest price, the best deal, the average and "you can save", the way an out-of-stock or unusual price is. When NO offer of a product
// is current, all of them are used (a product still needs a price to show), and the labels say how old they are.
//
// An offer with no check date is not called out of date: not knowing is not the same as knowing it is old.
//
// frontend/src/lib/freshness.js applies the same rule with the same number; tests on both sides pin it to 14.

export const STALE_AFTER_DAYS = 14;

const DAY_MS = 24 * 3600 * 1000;

/** True when the offer's price was last checked more than STALE_AFTER_DAYS days before `now`. */
export function isOutOfDate(offer, now = Date.now()) {
  const checked = new Date(offer?.lastScrapedAt ?? 0).getTime();
  if (!Number.isFinite(checked) || checked <= 0) return false;
  return now - checked > STALE_AFTER_DAYS * DAY_MS;
}

/** The offers a comparison should use: the current ones, or all of them when none is current. */
export function currentOffers(offers, now = Date.now()) {
  const list = Array.isArray(offers) ? offers : [];
  const current = list.filter((offer) => !isOutOfDate(offer, now));
  return current.length > 0 ? current : list;
}
