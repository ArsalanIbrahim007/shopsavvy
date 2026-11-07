// caught.js — the evidence against a caught discount, as sentences (components/CaughtCard.jsx): what the listing's price history
// shows, and what the other stores charge (backend/src/services/caughtFeed.service.js gives the numbers).

import { formatNumber, formatPrice } from "./format.js";

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
