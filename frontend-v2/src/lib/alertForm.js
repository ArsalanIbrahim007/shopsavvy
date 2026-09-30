// alertForm.js — the rules of the price-alert form, apart from how it is drawn. The server checks the same things
// (and has the last word); checking here gives the message next to the field without a round trip.

import { formatPrice } from "./format.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A sensible starting target: about 5% below the current price, to the nearest 100 (empty if that is not a real price). */
export function suggestedTarget(price) {
  const target = Math.floor((Number(price) * 0.95) / 100) * 100;
  return Number.isFinite(target) && target > 0 ? target : "";
}

/**
 * @param {{email: string, target: string|number}} values
 * @param {number} price  the listing's current price
 * @returns {{email?: string, target?: string}} a message per invalid field; empty when everything is fine
 */
export function validateAlert({ email, target }, price) {
  const errors = {};
  if (!EMAIL_PATTERN.test(String(email ?? "").trim())) errors.email = "Enter a valid email address.";

  const number = Number(target);
  if (!String(target ?? "").trim() || !Number.isFinite(number) || number <= 0) errors.target = "Enter a price above zero.";
  else if (number >= price) errors.target = `The target must be below the current price (${formatPrice(price)}).`;
  return errors;
}
