// verdicts.js — turning the backend's analysis fields into things a shopper can
// read: a label, a tone, and the reason.
//
// Tones are meanings ("good", "caution", "bad", "neutral"), not colours. What each
// tone looks like belongs to the design system, so a redesign changes one
// stylesheet, not this file.

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

/** Recommendation for an offer, with a safe fallback. */
export function recommendationOf(offer) {
  return RECOMMENDATIONS[offer?.recommendation?.action] || RECOMMENDATIONS.NO_HISTORY;
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

  const verdict = DISCOUNT_VERDICTS[offer?.discountAnalysis?.classification];
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
