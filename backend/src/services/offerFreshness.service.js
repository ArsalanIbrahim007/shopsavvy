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

const PRE_OWNED = new Set(["used", "refurbished", "open_box"]);
const isSuspect = (offer) => String(offer?.priceCheck?.status ?? "").startsWith("suspect");

/**
 * The offers a product's headline numbers come from (its lowest and highest price, its best deal): the rule the site's pages apply
 * (frontend/src/lib/summary.js summarizeOffers), so the server's numbers agree with what a shopper sees. New ones when there are
 * any (lib/condition.js), current ones (above), not a probable listing error (pricePlausibility), not one priced like a non-PTA unit
 * (productGrouping ptaAssessment), and in stock; each step only when something is left after it.
 * Before this the server's lowestPrice and bestDeal took every offer: in 58 phone products the lowest price, and in 39 the best deal,
 * was an offer out of stock while another store had it, and the Compare page, the extension and share previews read those (audit,
 * 2026-11-12).
 */
export function headlineOffers(offers, now = Date.now()) {
  const all = Array.isArray(offers) ? offers : [];
  const fresh = all.filter((offer) => !PRE_OWNED.has(offer?.condition));
  const current = currentOffers(fresh.length > 0 ? fresh : all, now);
  const believable = current.filter((offer) => !isSuspect(offer));
  // Never one priced like a non-PTA unit while there is another; then in stock before out of stock, and among those, one that says
  // PTA approved before one that does not say ("not_stated"). Stock comes first: a Galaxy A56 12/256's lowest price was PKR 123,000,
  // out of stock, because the in-stock offers (from 139,999) did not state PTA approval.
  const notNonPta = believable.filter((offer) => offer.ptaAssessment !== "likely_non_pta");
  const base = notNonPta.length ? notNonPta : believable.length ? believable : current;
  const inStock = base.filter((offer) => offer.inStock !== false);
  const stocked = inStock.length ? inStock : base;
  const stated = stocked.filter((offer) => !offer.ptaAssessment);
  return stated.length ? stated : stocked;
}
