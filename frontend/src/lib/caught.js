// caught.js — the evidence against a caught discount, as sentences (components/CaughtCard.jsx): what the listing's price history
// shows, and what the other stores charge (backend/src/services/caughtFeed.service.js gives the numbers).

import { formatNumber, formatPrice } from "./format.js";

/**
 * The caught discounts worth putting in front of a shopper (2026-11-21). Left out: a "was" price more than five times anything seen
 * for the product (a store's typo, "PKR 749,999" for a PKR 59,999 phone: true, but it reads as our own bug), and one whose recorded
 * highest is below the price shown (the price rose after the last check, so the card contradicted itself).
 */
export function showableExamples(examples = []) {
  return examples.filter((item) => {
    const seen = Math.max(item.price || 0, item.history?.highest || 0, item.market?.highest || 0);
    if (seen > 0 && item.originalPrice > 5 * seen) return false;
    if (item.history?.highest > 0 && item.history.highest < item.price) return false;
    return true;
  });
}

export function evidenceOf(item) {
  const lines = [];
  if (item.history?.highest > 0) {
    const checks = item.history.checks > 0 ? `In ${formatNumber(item.history.checks)} price checks we` : "We";
    lines.push(`${checks} never saw it above ${formatPrice(item.history.highest)}.`);
  }
  if (item.market?.highest > 0) {
    const stores = item.market.stores > 0 ? `${formatNumber(item.market.stores)} other ${item.market.stores === 1 ? "store charges" : "stores charge"}` : "Other stores charge";
    lines.push(`${stores} at most ${formatPrice(item.market.highest)}.`);
  }
  return lines;
}
