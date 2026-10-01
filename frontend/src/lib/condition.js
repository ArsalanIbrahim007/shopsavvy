// condition.js — used, refurbished and open-box offers, kept apart from new ones.
//
// The server reads an offer's condition from its title (productAttributes.service.js) and never groups a used offer with
// a new one, so a used product is a group of its own. What this file adds is how the shopper sees it: labelled, in its own
// section of the results, and never counted in the headline numbers. A used phone at PKR 60,000 is not "the lowest
// price" of a new one at PKR 280,000, and a refurbished laptop must not set "you can save".
//
// An offer with no stated condition is new (the server's default), so nothing here changes anything for a page of new
// products.

const PRE_OWNED = new Set(["used", "refurbished", "open_box"]);

const FLAGS = {
  used: {
    id: "condition", tone: "caution", label: "Used",
    reason: "The store lists this as used. Its price is not compared with new ones, so ask about its condition and warranty.",
  },
  refurbished: {
    id: "condition", tone: "caution", label: "Refurbished",
    reason: "The store lists this as refurbished (repaired or restored). Its price is not compared with new ones, so ask about the warranty.",
  },
  open_box: {
    id: "condition", tone: "caution", label: "Open box",
    reason: "The store lists this as open box (the packaging has been opened). Its price is not compared with new ones, so ask about the warranty.",
  },
};

/** True for an offer the store lists as used, refurbished or open box. */
export const isPreOwned = (offer) => PRE_OWNED.has(offer?.condition);

/** { id, tone, label, reason } for a used, refurbished or open-box offer; null for a new one. */
export const conditionFlag = (offer) => FLAGS[offer?.condition] ?? null;

/**
 * The offers a price comparison should use: the new ones, or all of them when there are no new ones (a page of
 * refurbished laptops still needs a "lowest price", compared only with its own kind).
 */
export function comparableOffers(offers) {
  const list = Array.isArray(offers) ? offers : [];
  const fresh = list.filter((offer) => !isPreOwned(offer));
  return fresh.length > 0 ? fresh : list;
}

/** True when the offers are not empty and every one of them is used, refurbished or open box. */
export const allPreOwned = (offers) => Array.isArray(offers) && offers.length > 0 && offers.every(isPreOwned);

/**
 * Splits product groups into new products and pre-owned ones. A group counts as pre-owned only when every offer in it
 * is; a group that somehow holds both stays with the new ones, where its pre-owned offers are labelled and left out of
 * its prices.
 */
export function splitByCondition(groups) {
  const fresh = [];
  const preOwned = [];
  for (const group of groups ?? []) (allPreOwned(group?.offers) ? preOwned : fresh).push(group);
  return { fresh, preOwned };
}

/** A sentence for the top of a product that is not (only) new, or null when every offer is new. */
export function conditionNotice(offers) {
  const list = Array.isArray(offers) ? offers : [];
  const preOwned = list.filter(isPreOwned);
  if (preOwned.length === 0) return null;

  if (preOwned.length === list.length) {
    const kinds = new Set(preOwned.map((offer) => offer.condition));
    const what = kinds.size === 1 ? FLAGS[[...kinds][0]].label.toLowerCase() : "used, refurbished or open box";
    return `These offers are ${what}, not new. They are compared only with each other, never with new prices. Ask the store about condition and warranty before you buy.`;
  }
  const count = preOwned.length;
  return `${count === 1 ? "1 offer is" : `${count} offers are`} used, refurbished or open box, not new. ${count === 1 ? "It is" : "They are"} labelled below and left out of the lowest price, the best deal and what you can save.`;
}
