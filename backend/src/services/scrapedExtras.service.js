// scrapedExtras.service.js — validates the optional fields a scraper may send
// beyond the core listing: rating, reviewCount and specs.
//
// Scrapers read these from third-party pages, so they are untrusted and often
// messy ("4.5 out of 5", "1,234 reviews", spec tables with empty cells). Each
// function returns a clean value or null. null means "the store did not show
// it", which is different from 0: a shopper must never see "0 stars" for a
// product nobody has rated.

const MAX_SPEC_ENTRIES = 40;
const MAX_SPEC_LABEL = 60;
const MAX_SPEC_VALUE = 200;

/** A rating on a 0-5 scale, or null. Zero is treated as "no rating". */
export function normalizeRating(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number <= 0 || number > 5) return null;
  return Math.round(number * 10) / 10;
}

/** A whole number of reviews (zero or more), or null. Accepts "1,234". */
export function normalizeReviewCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseInt(String(value).replace(/[,\s]/g, ""), 10);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) return null;
  return number;
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * A flat object of label to value strings, or null when nothing usable is
 * left. Accepts an object or an array of { label, value } / [label, value].
 * Labels are made safe to use as database keys (no leading "$", no dots), empty
 * entries are dropped, and the count and lengths are capped so one bad page
 * cannot store a huge document.
 */
export function normalizeSpecs(value) {
  if (!value || typeof value !== "object") return null;

  let pairs;
  if (Array.isArray(value)) {
    pairs = value.map((item) =>
      Array.isArray(item) ? [item[0], item[1]] : [item?.label, item?.value]
    );
  } else {
    pairs = Object.entries(value);
  }

  const specs = {};
  for (const [rawLabel, rawValue] of pairs) {
    if (Object.keys(specs).length >= MAX_SPEC_ENTRIES) break;

    const label = cleanText(rawLabel, MAX_SPEC_LABEL).replace(/^\$+/, "").replace(/\./g, " ").trim();
    const text = cleanText(rawValue, MAX_SPEC_VALUE);
    if (!label || !text || label in specs) continue;

    specs[label] = text;
  }

  return Object.keys(specs).length > 0 ? specs : null;
}

/** The three optional fields of a scraped listing, each validated. */
export function extractExtras(scraped = {}) {
  return {
    rating: normalizeRating(scraped.rating),
    reviewCount: normalizeReviewCount(scraped.reviewCount),
    specs: normalizeSpecs(scraped.specs),
  };
}
