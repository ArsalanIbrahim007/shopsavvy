// verdicts.js — turning the backend's analysis fields into things a shopper can
// read: a label, a tone, and the reason.
//
// Tones are meanings ("good", "caution", "bad", "neutral"), not colours. What each
// tone looks like belongs to the design system, so a redesign changes one
// stylesheet, not this file.

import { formatPrice } from "./format.js";

export const RECOMMENDATIONS = {
  BUY_NOW: { label: "Buy now", tone: "good" },
  GOOD_DEAL: { label: "Good deal", tone: "good" },
  FAIR_PRICE: { label: "Fair price", tone: "neutral" },
  WAIT: { label: "Wait", tone: "caution" },
  OVERPRICED: { label: "Overpriced", tone: "bad" },
  NO_HISTORY: { label: "Not enough history", tone: "neutral" },
};

// Outcomes of the history-based discount check (offer.discountAnalysis.classification).
export const DISCOUNT_VERDICTS = {
  likely_fake: { label: "Fake discount", tone: "bad" },
  suspicious: { label: "Suspicious discount", tone: "caution" },
  genuine_discount: { label: "Verified discount", tone: "good" },
  possibly_genuine: { label: "Likely genuine", tone: "good" },
  unverified_discount: { label: "Unverified discount", tone: "neutral" },
  no_claimed_discount: null,
};

// A "suspicious" discount says what it rests on (backend fakeDiscountScore.js suspicionKind, 2026-11-18): under two weeks of the
// store's history without its "was" price seen yet is unconfirmed, not suspicious; two weeks and more without the store ever charging
// it is a standing "sale". The rest keep the plain verdict.
const SUSPICION_KINDS = {
  unconfirmed: { label: "Unconfirmed discount", tone: "neutral" },
  never_charged: { label: "Never sold at \"was\" price", tone: "caution" },
};

/** The discount verdict to show for an offer's discountAnalysis, or null when it claims no discount. */
export function discountVerdictOf(analysis) {
  if (analysis?.classification === "suspicious" && SUSPICION_KINDS[analysis.suspicionKind]) return SUSPICION_KINDS[analysis.suspicionKind];
  return DISCOUNT_VERDICTS[analysis?.classification] ?? null;
}

// Why an offer cannot be bought, when the store says (backend listing.availability, 2026-11-18).
const AVAILABILITY = {
  coming_soon: { label: "Coming soon", reason: "Not on sale yet: the store shows an expected price and no way to buy it." },
  discontinued: { label: "Discontinued", reason: "The store no longer sells it; this is its last price." },
  out_of_stock: { label: "Out of stock", reason: "The store shows it out of stock." },
};

/** {label, reason} when the offer cannot be bought (coming soon, discontinued, out of stock), otherwise null. */
export function availabilityOf(offer) {
  if (offer?.inStock !== false) return null;
  return AVAILABILITY[offer.availability] ?? AVAILABILITY.out_of_stock;
}

// Stores whose listings never state stock: Mega.pk's search and category cards show a price whether or not it can be bought, and
// only its product page says "out of stock" (audit S-008: an Apple Watch shown in stock that Mega had sold out). Not "In stock".
const STOCK_UNSTATED_STORES = new Set(["mega"]);

/** The offers table's stock words: "In stock", "Stock not confirmed" (a store that does not say), or why it cannot be bought. */
export function stockLabelOf(offer) {
  if (offer?.inStock === false) return { label: availabilityOf(offer).label, known: true };
  if (STOCK_UNSTATED_STORES.has(String(offer?.platform ?? "").toLowerCase())) {
    return { label: "Stock not confirmed", known: false, reason: "This store's listings do not say whether it is in stock. Check its page before you buy." };
  }
  return { label: "In stock", known: true };
}

/** Recommendation for an offer, with a safe fallback. */
export function recommendationOf(offer) {
  return RECOMMENDATIONS[offer?.recommendation?.action] || RECOMMENDATIONS.NO_HISTORY;
}

// How far above the lowest price for the same product an offer may be and still be called a good deal. The server scores each
// offer on its own (its history, its discount), so it called PriceOye's iPhone 17 Pro a good deal at PKR 34,000 (8%) above
// Shophive's, and nearly every row of a product's table said "Good deal", which told the shopper nothing.
export const GOOD_DEAL_MARGIN = 0.05;

/**
 * The recommendation to show for an offer, with its reason: the server's, except that a "Good deal" or "Buy now" for an offer
 * priced more than GOOD_DEAL_MARGIN above `lowestPrice` (the lowest price we believe for the same product, from
 * summarizeOffers) is shown as a fair price, saying how much cheaper the product is elsewhere.
 * @returns {{label:string, tone:string, reason:string}}
 */
export function offerVerdict(offer, { lowestPrice = null } = {}) {
  const recommendation = recommendationOf(offer);
  const reason = offer?.recommendation?.reason || "";
  // An offer that cannot be bought is never "Buy now" or "Good deal" (2026-11-18: a coming-soon TCL TV said "Buy now").
  const unavailable = availabilityOf(offer);
  if (unavailable && recommendation.tone === "good") return { label: unavailable.label, tone: "neutral", reason: unavailable.reason };
  const price = Number(offer?.price);
  if (recommendation.tone === "good" && lowestPrice > 0 && price > lowestPrice * (1 + GOOD_DEAL_MARGIN)) {
    return {
      ...RECOMMENDATIONS.FAIR_PRICE,
      reason: `${formatPrice(price - lowestPrice)} more than the lowest price we found for this product (${formatPrice(lowestPrice)}).`,
    };
  }
  return { ...recommendation, reason };
}

/** The sentences of a server reason, for a list ("A. B. C." -> ["A.", "B.", "C."]). */
export function reasonPoints(reason = "") {
  return String(reason).split(/(?<=\.)\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
}

/** The first sentence of a server reason, for a one-line note (the server joins up to six). */
export function briefReason(reason = "") {
  return reasonPoints(reason)[0] ?? "";
}

/**
 * Every warning or confirmation to show on an offer, in the order to show it.
 * Each item: { id, tone, label, reason }. An offer with nothing to say returns [].
 *
 *  - the history-based discount check
 *  - the cross-store check ("above market")
 *  - the price plausibility check ("unusual price")
 */
export function offerFlags(offer) {
  const flags = [];

  const verdict = discountVerdictOf(offer?.discountAnalysis);
  if (verdict) {
    flags.push({ id: "discount", tone: verdict.tone, label: verdict.label, reason: offer.discountAnalysis.reason || "" });
  }

  if (offer?.discountAnomaly?.isAnomalous) {
    flags.push({ id: "market", tone: "caution", label: "Above market", reason: offer.discountAnomaly.reason || "" });
  }

  if (offer?.priceCheck?.status?.startsWith("suspect")) {
    flags.push({ id: "price", tone: "caution", label: "Unusual price", reason: offer.priceCheck.reason || "" });
  }

  return flags;
}

/**
 * The badges for one offer on a card: its recommendation and its warnings, without contradicting
 * each other. A "Good deal" next to "Fake discount" or "Suspicious discount" tells the shopper two
 * opposite things, and the warning is the one that matters, so any cautionary or bad flag replaces a
 * good-toned recommendation (a neutral one, such as "Unverified discount", does not).
 * `lowestPrice` is passed on to offerVerdict. Each item: { id, tone, label, reason }.
 */
export function cardBadges(offer, { maxFlags = 2, lowestPrice = null } = {}) {
  const verdict = offerVerdict(offer, { lowestPrice });
  const flags = offerFlags(offer);
  const hasWarning = flags.some((flag) => flag.tone === "bad" || flag.tone === "caution");

  const badges = [];
  if (!(hasWarning && verdict.tone === "good")) {
    badges.push({ id: "recommendation", tone: verdict.tone, label: verdict.label, reason: verdict.reason });
  }
  return [...badges, ...flags.slice(0, maxFlags)];
}

/** The single reading of the cross-store discount check, for the detail page. */
export function marketVerdict(offer) {
  switch (offer?.discountAnomaly?.status) {
    case "anomalous":
      return { label: "Above market", tone: "caution", reason: offer.discountAnomaly.reason };
    case "consistent":
      return { label: "In line with other stores", tone: "good", reason: offer.discountAnomaly.reason };
    case "not_comparable":
      return { label: "Not enough stores to compare", tone: "neutral", reason: offer.discountAnomaly.reason };
    default:
      return null;
  }
}
