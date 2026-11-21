// homePicks.js — what the home page puts in its rows (2026-11-21, a friend: "too much information"; a review: five Xiaomis in a
// row, MacBooks "checked 3 days ago", eight deals leaving a row of three).

const FRESH_MS = 48 * 3600 * 1000;
const brandOf = (group) => String(group.offers?.[0]?.brand || group.productName || "").trim().split(/\s+/)[0].toLowerCase();

/** Fills up to `shown` from `items` keeping at most `perKey` of one key, in the given order; tops up from the rest when too few. */
function varied(items, keyOf, { shown, perKey }) {
  const counts = new Map();
  const picked = [];
  for (const item of items) {
    const key = keyOf(item);
    if ((counts.get(key) ?? 0) >= perKey) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    picked.push(item);
    if (picked.length === shown) return picked;
  }
  for (const item of items) {
    if (picked.length === shown) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

/**
 * "Most compared" products for a home-page row: only those with a price checked in the last two days, at most two of one brand,
 * in the server's order (the most stores first).
 */
export function pickMostCompared(groups = [], { now = Date.now(), shown = 5, perBrand = 2 } = {}) {
  const fresh = groups.filter((group) => (group.offers ?? []).some((offer) => now - new Date(offer.lastScrapedAt || 0).getTime() < FRESH_MS));
  return varied(fresh, brandOf, { shown, perKey: perBrand });
}

/** Verified deals for the home page: two full rows of five, at most three from one category, in the server's order (biggest saving). */
export function pickDeals(deals = [], { shown = 10, perCategory = 3 } = {}) {
  return varied(deals, (deal) => deal.category, { shown, perKey: perCategory });
}
