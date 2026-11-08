// Platform trust values are keyed on a canonical form so that scraper output
// ("priceoye", "mega") and seeded data ("PriceOye", "Mega.pk") resolve to the
// same score. Without this, scraped listings silently fall to the default.

const PLATFORM_TRUST_SCORES = {
  priceoye: 0.95,
  daraz: 0.93,
  mega: 0.9,
  shophive: 0.88,
  telemart: 0.85,
  ishopping: 0.85,
  homeshopping: 0.82,
  paklap: 0.8,
  czone: 0.8,
  galaxy: 0.78,
  vmart: 0.75,
  // Added 2026-10-01 with the platform adapters (scrapers/stores.js). A judgement, not a measurement: a brand's own store and
  // an established retail chain are trusted a little above the default; the smaller shops sit just above it.
  mistore: 0.88,
  alfatah: 0.85,
  mymart: 0.78,
  xcessorieshub: 0.75,
  eezepc: 0.75,
  ledshop: 0.75,
  // Added 2026-10-22 (scrapers/stores.js), on the same judgement: a brand selling its own products is trusted like an official
  // store; an established electronics chain a little above the default; the smaller shops just above it.
  audionic: 0.85,
  ronin: 0.82,
  zerolifestyle: 0.82,
  baseus: 0.78,
  infinix: 0.75,
  jalalelectronics: 0.78,
  japanelectronics: 0.78,
  subhanelectronics: 0.75,
  techroid: 0.75,
  // Banks' marketplaces (2026-10-22): an established operator, but each product is sold by one of many sellers.
  alfamall: 0.8,
  digimall: 0.8,
};

// Maps domain-style names onto their canonical platform key.
const PLATFORM_ALIASES = {
  megapk: "mega",
  priceoyepk: "priceoye",
  shophivecom: "shophive",
  telemartpk: "telemart",
  homeshoppingpk: "homeshopping",
  paklapcom: "paklap",
  czonepk: "czone",
};

const DEFAULT_TRUST = 0.6;

export function canonicalPlatform(platform = "") {
  const stripped = String(platform)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return PLATFORM_ALIASES[stripped] || stripped;
}

// A product's own rating counts once enough shoppers gave one (2026-11-08: the initial report promised ranking on price, rating,
// delivery and reliability, and rating was not in the score). It is a fifth of the trust part, beside the store's reputation; a
// product without MIN_REVIEWS ratings is judged on the store alone, so having no reviews costs nothing.
export const MIN_REVIEWS = 5;
export const RATING_SHARE = 0.2;

/** 0 for a 3-star average or less, 1 for 5 stars, in a straight line between; null without enough reviews. */
export function ratingValue(rating, reviewCount) {
  if (!(Number(rating) > 0) || !(Number(reviewCount) >= MIN_REVIEWS)) return null;
  return Math.min(1, Math.max(0, (Number(rating) - 3) / 2));
}

export function calculateTrustScore(platform = "", weight = 20, { rating = null, reviewCount = null } = {}) {
  const key = canonicalPlatform(platform);
  const trustValue = PLATFORM_TRUST_SCORES[key] ?? DEFAULT_TRUST;
  const product = ratingValue(rating, reviewCount);
  const value = product === null ? trustValue : trustValue * (1 - RATING_SHARE) + product * RATING_SHARE;

  return Number((value * weight).toFixed(2));
}

export { PLATFORM_TRUST_SCORES, DEFAULT_TRUST };