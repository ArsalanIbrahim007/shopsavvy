// summary.js — the headline numbers for a set of offers.

import { canonicalPlatform } from "./platforms.js";
import { offerCount } from "./colours.js";
import { allPreOwned, comparableOffers } from "./condition.js";
import { currentOffers } from "./freshness.js";
import { isDiscountDoubtful } from "./filters.js";

/**
 * When the data was actually collected: the newest lastScrapedAt among the offers.
 * (The previous UI printed the current time here, which claimed a freshness the
 * data did not have.)
 * @returns {Date|null}
 */
export function newestScrape(offers) {
  let newest = null;
  for (const offer of offers) {
    const time = new Date(offer.lastScrapedAt || offer.updatedAt || 0).getTime();
    if (Number.isFinite(time) && time > 0 && (newest === null || time > newest)) newest = time;
  }
  return newest === null ? null : new Date(newest);
}

const suspect = (offer) => offer?.priceCheck?.status?.startsWith("suspect");

/**
 * Used, refurbished and open-box offers are left out of every number here whenever there is a new offer to compare
 * (see lib/condition.js): their prices are shown in their own section, never as "the lowest price". `excluded` says how
 * many were left out, and `preOwnedOnly` that all that is left is pre-owned (a search for refurbished laptops).
 * An offer whose price has not been checked for two weeks is left out the same way (lib/freshness.js) while a current one exists;
 * `outOfDate` says how many were left out for that.
 * @returns {{count:number, platformCount:number, lowest:object|null, average:number|null,
 *            bestDeal:object|null, flagged:number, updatedAt:Date|null, excluded:number, outOfDate:number, preOwnedOnly:boolean}}
 */
export function summarizeOffers(allOffers) {
  const sameKind = comparableOffers(allOffers);
  const offers = currentOffers(sameKind);
  if (!offers.length) {
    return { count: 0, platformCount: 0, lowest: null, average: null, bestDeal: null, flagged: 0, updatedAt: null, excluded: 0, outOfDate: 0, preOwnedOnly: false };
  }

  // An offer flagged as a probable listing error is never presented as the lowest price or the best deal, and
  // neither is one that does not say whether a phone is PTA approved while being priced like a non-PTA unit
  // (see lib/pta.js): it would make the PTA-approved offers look expensive. They stay in the list, labelled.
  const believable = offers.filter((offer) => !suspect(offer));
  const comparable = believable.filter((offer) => !offer.ptaAssessment);
  // A price the shopper cannot buy at is not "the lowest price": offers in stock come first, and the rest are used only
  // when nothing is in stock (they stay in the table, marked out of stock).
  const buyable = comparable.filter((offer) => offer.inStock !== false);
  const pool = buyable.length ? buyable : comparable.length ? comparable : believable.length ? believable : offers;

  const lowest = pool.reduce((a, b) => (b.price < a.price ? b : a));
  const bestDeal = [...pool].sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0))[0] || lowest;

  return {
    count: offerCount(offers), // colour variants of one store at one price are one offer
    platformCount: new Set(offers.map((o) => canonicalPlatform(o.platform))).size,
    lowest,
    average: Math.round(offers.reduce((sum, o) => sum + o.price, 0) / offers.length),
    bestDeal,
    flagged: offers.filter(isDiscountDoubtful).length,
    updatedAt: newestScrape(offers),
    excluded: allOffers.length - sameKind.length,
    outOfDate: sameKind.length - offers.length,
    preOwnedOnly: allPreOwned(offers),
  };
}
