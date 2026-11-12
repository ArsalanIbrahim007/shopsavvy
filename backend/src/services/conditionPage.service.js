// conditionPage.service.js — is the phone on a store's product page used, though its title does not say so?
//
// iShopping sells used iPhones from marketplace sellers under titles like a new phone's ("Apple iPhone 15 128GB PTA Approved", PKR
// 173,400 beside new ones at 264,999 to 329,999). Only the page says what it is: "Condition: 10/10 • Battery Health: 85%+ Boosted •
// 7 Days Checking & Replacement Warranty • No Box Only Kit", sold by a seller called "LIKE NEW" (read 2026-11-12, audit finding 12).
// Read as new, such a phone was the lowest price of the new one, and the price check passed it (60% of the others' price).
//
// A page counts as a used phone's only with at least two of these signs, each one a used phone's mark that a new phone's page has no
// reason to carry; one alone (a description mentioning battery health) is not enough.

const SIGNS = [
  ["condition score", /\bcondition\s*:?\s*(10|[1-9](\.\d)?)\s*\/\s*10\b/i],
  ["battery health", /\bbattery health\s*:?\s*\d{2,3}\s*%/i],
  ["no box", /\b(no box|without box|only kit|box not included)\b/i],
  ["checking warranty", /\b\d+\s*days?\s*checking\b/i],
  ["sold as like new", /\bsold by\s*:?\s*like new\b/i],
  ["pre-owned", /\b(pre[- ]?owned|second[- ]?hand|used phone|refurbished)\b/i],
];
export const MIN_SIGNS = 2;

/** A page's text: tags, scripts and styles removed, entities for spaces and ampersands read. */
function pageText(html) {
  return String(html ?? "")
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

/**
 * @param {string} html a store's product page
 * @returns {{condition: "used"|null, evidence: string[]}} "used" with the signs found, or null when the page does not show enough
 */
export function extractConditionFromPage(html) {
  const text = pageText(html);
  const evidence = SIGNS.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { condition: evidence.length >= MIN_SIGNS ? "used" : null, evidence };
}
