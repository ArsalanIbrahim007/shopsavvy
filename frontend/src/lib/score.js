// score.js — the deal score as a shopper can read it. The backend gives every offer a total out of 100
// and how it was reached; showing the parts is what makes the ranking defensible ("hover any score to
// see its breakdown"). Labels and the maximum of each part come from the server's own weights, so a
// change there shows up here without a code change.

const PARTS = [
  { key: "price", label: "Price competitiveness", fallbackMax: 60 },
  { key: "trust", label: "Store trust", fallbackMax: 20 },
  { key: "freshness", label: "Data freshness", fallbackMax: 10 },
  { key: "availability", label: "Availability", fallbackMax: 10 },
];

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** The offer's total score (0-100), or null when it has none. */
export function scoreOf(offer) {
  return number(offer?.dealScore);
}

/** "high" from 80, "mid" from 55, otherwise "low": the same bands the old UI used. */
export function scoreTone(score) {
  if (!Number.isFinite(score)) return "none";
  if (score >= 80) return "high";
  if (score >= 55) return "mid";
  return "low";
}

/**
 * The four parts of a score, each { key, label, got, max }. Empty when the offer has no breakdown.
 * A part the server did not send counts as 0, and a score part never exceeds its maximum on screen.
 */
export function scoreParts(offer) {
  const breakdown = offer?.scoreBreakdown;
  if (!breakdown) return [];

  return PARTS.map(({ key, label, fallbackMax }) => {
    const max = number(offer.scoreWeights?.[key]) ?? fallbackMax;
    const got = Math.min(Math.max(number(breakdown[key]) ?? 0, 0), max);
    return { key, label, got, max };
  });
}

/**
 * The offer the shopper should be pointed to as "the best deal": highest score among the offers whose price
 * we believe, and only when there is more than one offer (a single offer has not been compared with anything).
 *
 * An offer the server has marked (`ptaAssessment`: it does not say whether the phone is PTA approved, or is priced
 * like a non-PTA unit) cannot be the best deal: it cannot be told apart from a cheaper non-PTA unit. The server
 * applies the same rule to the product's own `bestDeal`, and summarizeOffers to the lowest price.
 */
export function bestDealOffer(offers) {
  if (!Array.isArray(offers) || offers.length < 2) return null;
  const believable = offers.filter((offer) => !offer?.priceCheck?.status?.startsWith("suspect"));
  const unmarked = believable.filter((offer) => !offer?.ptaAssessment);
  const inStock = unmarked.filter((offer) => offer?.inStock !== false); // a best deal that cannot be bought is no deal
  const pool = inStock.length > 0 ? inStock : unmarked.length > 0 ? unmarked : believable;
  const ranked = [...pool].sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0));
  return ranked[0] ?? null;
}
