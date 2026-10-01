// freshness.js — an offer whose price has not been checked for a long time is not "the lowest price".
//
// Scraping is search-driven: a listing is refreshed only when a query happens to return it, so some stored offers are weeks old (on
// 2026-10-01, 177 had not been checked for over 30 days). A price that old may no longer be on the store, or may have changed.
//
// An offer last checked more than STALE_AFTER_DAYS days ago is "out of date": it stays in the list, labelled, but it is left out of the
// lowest price, the best deal, the average and "you can save", the way an out-of-stock or unusual price is. When NO offer of a product
// is current, all of them are used (a product still needs a price to show) and the labels say how old they are.
//
// An offer with no check date is not called out of date: not knowing is not the same as knowing it is old.
//
// The same rule, with the same number, is in backend/src/services/offerFreshness.service.js; tests on both sides pin it to 14.

import { platformName } from "./platforms.js";

export const STALE_AFTER_DAYS = 14;

const DAY_MS = 24 * 3600 * 1000;

const checkedAt = (offer) => {
  const time = new Date(offer?.lastScrapedAt ?? 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : null;
};

/** True when the offer's price was last checked more than STALE_AFTER_DAYS days before `now`. */
export function isOutOfDate(offer, now = Date.now()) {
  const time = checkedAt(offer);
  return time !== null && now - time > STALE_AFTER_DAYS * DAY_MS;
}

/** The offers a comparison should use: the current ones, or all of them when none is current. */
export function currentOffers(offers, now = Date.now()) {
  const list = Array.isArray(offers) ? offers : [];
  const current = list.filter((offer) => !isOutOfDate(offer, now));
  return current.length > 0 ? current : list;
}

/** Whole days since the offer's price was checked, or null when there is no date. */
export function ageInDays(offer, now = Date.now()) {
  const time = checkedAt(offer);
  return time === null ? null : Math.max(0, Math.floor((now - time) / DAY_MS));
}

/** { id, tone, label, reason } for an out-of-date offer; null for a current one. */
export function outOfDateFlag(offer, now = Date.now()) {
  if (!isOutOfDate(offer, now)) return null;
  return {
    id: "freshness", tone: "caution", label: "May be out of date",
    reason: `We last checked this price ${ageInDays(offer, now)} days ago. It may have changed, or the store may no longer sell it. Check the store before you buy.`,
  };
}

const storeList = (offers) => [...new Set(offers.map((offer) => platformName(offer.platform)))].join(", ");

/** A sentence for the top of a product that has out-of-date offers, or null when every offer is current. */
export function freshnessNotice(offers, now = Date.now()) {
  const list = Array.isArray(offers) ? offers : [];
  const old = list.filter((offer) => isOutOfDate(offer, now));
  if (old.length === 0) return null;

  if (old.length === list.length) {
    const newest = Math.min(...list.map((offer) => ageInDays(offer, now)));
    return `None of these prices has been checked for over ${STALE_AFTER_DAYS} days (the newest is ${newest} days old), so they may be out of date. Check the store before you buy.`;
  }
  const count = old.length;
  return `${count === 1 ? "1 price has" : `${count} prices have`} not been checked for over ${STALE_AFTER_DAYS} days (${storeList(old)}). ${count === 1 ? "It is" : "They are"} labelled below and left out of the lowest price, the best deal and what you can save.`;
}
