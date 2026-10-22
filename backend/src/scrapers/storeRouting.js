/**
 * Smart store routing — skip platforms that have never returned listings
 * for a given product category.
 *
 * Table derived from: node src/scripts/audit-scrapers.js (run 2026-10-14).
 * Update whenever the audit script produces a new report.
 *
 * Rule: a platform is included when it returned ≥1 listing for that category
 * in the last audit run. "other" and unknown categories are unrestricted —
 * all platforms run.
 */

export const STORE_ROUTING = {
  smartphone:     new Set(["priceoye", "mega", "shophive", "w11stop"]),
  headphones:     new Set(["priceoye", "mega", "shophive", "w11stop", "eezepc", "ishopping", "paklap", "telemart", "mistore", "mymart"]),
  laptop:         new Set(["priceoye", "mega", "shophive"]),
  tablet:         new Set(["priceoye", "mega", "shophive"]),
  tv:             new Set(["priceoye", "mega", "shophive"]),
  smartwatch:     new Set(["priceoye", "mega", "shophive", "w11stop"]),
  accessory:      new Set(["priceoye", "mega", "shophive", "w11stop"]),
  appliance:      new Set(["priceoye", "mega", "shophive"]),
  monitor:        new Set(["priceoye", "mega", "shophive"]),
  camera:         new Set(["shophive"]),
  gaming_console: new Set(["shophive"]),
};

/**
 * Returns the Set of platforms that carry this category,
 * or null when the category is unrestricted (run all platforms).
 *
 * @param {string} category - from detectQueryCategory()
 * @returns {Set<string> | null}
 */
export function allowedPlatforms(category) {
  return STORE_ROUTING[category] ?? null;
}