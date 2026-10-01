// pta.js — PTA approval as a shopper can read it. In Pakistan a phone that is not PTA-approved cannot use local
// networks without a tax payment, and such units are sold far cheaper (a bare "Apple iPhone 17" at PKR 284,999
// beside PTA-approved ones at PKR 370,000 to 398,000), so it must never be compared silently with approved ones.
//
// The server (productGrouping.service.js) does the work: it keeps offers that state "NON PTA" apart from
// approved ones, takes unstated offers that are priced far below the approved ones out of the product, and marks
// the rest with `ptaAssessment`: "not_stated" (stays in the product, says nothing either way) or "likely_non_pta"
// (moved out; priced like a non-PTA unit). This file turns those fields into a label and a short notice.
//
// Nothing here is shown for other categories or for offers with nothing to say, so laptops and TVs are unchanged.

const APPROVED = { id: "pta", tone: "good", label: "PTA approved", reason: "The store says this phone is PTA approved." };
const NON_PTA = {
  id: "pta", tone: "caution", label: "Non-PTA",
  reason: "The store says this phone is not PTA approved. It cannot use local SIMs reliably without paying tax, so it is not comparable with PTA-approved ones.",
};
const LIKELY_NON_PTA = {
  id: "pta", tone: "caution", label: "May be non-PTA",
  reason: "This offer does not say it is PTA approved and is priced far below the PTA-approved ones, so it may be a non-PTA unit or another version. Ask the store.",
};
const NOT_STATED = {
  id: "pta", tone: "neutral", label: "PTA not stated",
  reason: "The store does not say whether this phone is PTA approved. Ask before you buy.",
};

/** { id, tone, label, reason } for an offer, or null when there is nothing to say. */
export function ptaFlag(offer) {
  if (offer?.ptaAssessment === "likely_non_pta") return LIKELY_NON_PTA;
  if (offer?.ptaAssessment === "not_stated") return NOT_STATED;
  // A status read from the store's product page (the title said nothing) says so, so the shopper knows where it comes from.
  const fromPage = offer?.ptaSource === "product_page";
  if (offer?.ptaStatus === "pta_approved") return fromPage ? { ...APPROVED, reason: "The store's product page says this phone is PTA approved." } : APPROVED;
  if (offer?.ptaStatus === "non_pta") return fromPage ? { ...NON_PTA, reason: NON_PTA.reason.replace("The store says", "The store's product page says") } : NON_PTA;
  return null;
}

const countOf = (offers, assessment) => offers.filter((offer) => offer?.ptaAssessment === assessment).length;

/**
 * One sentence for the top of a product, or null. Says what the product's best deal does and does not count.
 * @param {object[]} offers
 */
export function ptaNotice(offers) {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  const likely = countOf(offers, "likely_non_pta");
  if (likely === offers.length) {
    return "None of these offers says the phone is PTA approved, and their prices are far below the PTA-approved versions, so they may be non-PTA units or another version. Check with the store before you buy.";
  }

  const notStated = countOf(offers, "not_stated");
  if (notStated > 0) {
    const what = notStated === 1 ? "1 offer does" : `${notStated} offers do`;
    return `${what} not say whether the phone is PTA approved. The best deal only counts offers that do, so ask those stores before you buy.`;
  }
  return null;
}
