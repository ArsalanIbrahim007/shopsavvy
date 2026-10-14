// drops.js — wording for the price-drops page. The server decides what counts as a drop (backend priceDrops.service.js) and sends
// its thresholds with the list; this file only says them in plain words.

import { formatPrice } from "./format.js";

/** "11 Oct" from a calendar day "2026-10-11" (the server's Pakistan day), the same on any machine's time zone. */
export function formatDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "23.4% less" / "6% less": one decimal only when it says something. */
export function formatDropPercent(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}% less`;
}

/** "Was PKR 204,999 on 11 Oct" */
export const wasLine = (drop) => `Was ${formatPrice(drop.before)} on ${formatDay(drop.beforeDay)}`;

/** The rules, as a sentence, from what the server says it used; a fixed sentence when it said nothing. */
export function rulesSentence(rules) {
  if (!rules) return "Only prices that fell by a real margin since the store's previous check are shown.";
  return (
    `Shown when a store's price fell by at least ${rules.MIN_PERCENT}% and ${formatPrice(rules.MIN_RUPEES)} since the previous day we checked it ` +
    `(at most ${rules.BEFORE_MAX_DAYS} days earlier), and we saw the new price in the last ${rules.RECENT_DAYS} days. ` +
    `A fall of more than ${rules.MAX_PERCENT}% is left out: that is more often a listing mistake than a sale. Used and refurbished offers are not included.`
  );
}
