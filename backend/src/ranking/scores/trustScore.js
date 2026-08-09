// Platform trust values are keyed on a canonical form so that scraper output
// ("priceoye", "mega") and seeded data ("PriceOye", "Mega.pk") resolve to the
// same score. Without this, scraped listings silently fall to the default.

const PLATFORM_TRUST_SCORES = {
  priceoye: 0.95,
  mega: 0.9,
  shophive: 0.88,
  telemart: 0.85,
  homeshopping: 0.82,
  paklap: 0.8,
  czone: 0.8,
  galaxy: 0.78,
  vmart: 0.75,
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

export function calculateTrustScore(platform = "", weight = 20) {
  const key = canonicalPlatform(platform);
  const trustValue = PLATFORM_TRUST_SCORES[key] ?? DEFAULT_TRUST;

  return Number((trustValue * weight).toFixed(2));
}

export { PLATFORM_TRUST_SCORES, DEFAULT_TRUST };