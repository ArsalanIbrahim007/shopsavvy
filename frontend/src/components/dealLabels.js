// Wording and colour classes for the recommendation and discount verdicts.
// Shared by the results table and the product detail page so a verdict reads
// the same wherever it appears.

export const RECOMMENDATION_LABELS = {
  BUY_NOW: { text: "Buy Now", cls: "rec-buy" },
  GOOD_DEAL: { text: "Good Deal", cls: "rec-good" },
  FAIR_PRICE: { text: "Fair Price", cls: "rec-fair" },
  WAIT: { text: "Wait", cls: "rec-wait" },
  OVERPRICED: { text: "Overpriced", cls: "rec-over" },
  NO_HISTORY: { text: "No History", cls: "rec-none" },
};

export const DISCOUNT_LABELS = {
  likely_fake: { text: "Fake Discount", cls: "disc-fake" },
  suspicious: { text: "Suspicious", cls: "disc-suspicious" },
  genuine_discount: { text: "Verified", cls: "disc-genuine" },
  possibly_genuine: { text: "Likely Genuine", cls: "disc-likely" },
  unverified_discount: { text: "Unverified", cls: "disc-unverified" },
  no_claimed_discount: { text: "", cls: "" },
};
