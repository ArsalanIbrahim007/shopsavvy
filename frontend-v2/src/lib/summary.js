// summary.js — the headline numbers for a set of offers.

import { canonicalPlatform } from "./platforms.js";
import { offerCount } from "./colours.js";
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
 * @returns {{count:number, platformCount:number, lowest:object|null, average:number|null,
 *            bestDeal:object|null, flagged:number, updatedAt:Date|null}}
 */
export function summarizeOffers(offers) {
  if (!offers.length) {
    return { count: 0, platformCount: 0, lowest: null, average: null, bestDeal: null, flagged: 0, updatedAt: null };
  }

  // An offer flagged as a probable listing error is never presented as the lowest price or the best deal, and
  // neither is one that does not say whether a phone is PTA approved while being priced like a non-PTA unit
  // (see lib/pta.js): it would make the PTA-approved offers look expensive. They stay in the list, labelled.
  const believable = offers.filter((offer) => !suspect(offer));
  const comparable = believable.filter((offer) => !offer.ptaAssessment);
  const pool = comparable.length ? comparable : believable.length ? believable : offers;

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
  };
}
