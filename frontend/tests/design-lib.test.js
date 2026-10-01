import { describe, it, expect } from "vitest";
import { featuredCategories, isKnownCategory, FEATURED_CATEGORIES } from "../src/lib/categories.js";
import { cardBadges } from "../src/lib/verdicts.js";

describe("featuredCategories", () => {
  const counts = [
    { category: "smartphone", count: 1368 }, { category: "tv", count: 571 }, { category: "laptop", count: 371 },
    { category: "accessory", count: 235 }, { category: "other", count: 217 }, { category: "smartwatch", count: 148 },
    { category: "tablet", count: 104 }, { category: "appliance", count: 101 }, { category: "headphones", count: 79 },
    { category: "monitor", count: 23 },
  ];

  it("keeps only the categories the site is about, biggest first, with readable names", () => {
    expect(featuredCategories(counts).map((t) => t.category)).toEqual(["smartphone", "tv", "laptop", "smartwatch", "tablet", "headphones"]);
    expect(featuredCategories(counts)[0]).toEqual({ category: "smartphone", name: "Smartphones", count: 1368 });
  });

  it("hides a thin category so no tile looks empty", () => {
    expect(featuredCategories([{ category: "tablet", count: 19 }, { category: "tv", count: 20 }]).map((t) => t.category)).toEqual(["tv"]);
    expect(featuredCategories([{ category: "tablet", count: 5 }], { min: 1 })).toHaveLength(1);
  });

  it("copes with a missing, empty or malformed list and string counts", () => {
    expect(featuredCategories()).toEqual([]);
    expect(featuredCategories([null, {}, { category: "tv" }, { category: "tv", count: "abc" }])).toEqual([]);
    expect(featuredCategories([{ category: "tv", count: "571" }])[0].count).toBe(571);
  });

  it("breaks a tie by the site's own category order", () => {
    const tied = featuredCategories([{ category: "laptop", count: 50 }, { category: "tv", count: 50 }]);
    expect(tied.map((t) => t.category)).toEqual(["tv", "laptop"]);
  });

  it("knows which category ids exist, and not inherited object keys", () => {
    expect(isKnownCategory("smartphone")).toBe(true);
    expect(isKnownCategory("accessory")).toBe(true);
    for (const bad of ["toaster", "", "constructor", "__proto__", "toString", undefined, null]) expect(isKnownCategory(bad), String(bad)).toBe(false);
    expect(FEATURED_CATEGORIES.every(isKnownCategory)).toBe(true);
  });
});

describe("cardBadges", () => {
  const offer = (action, classification, extra = {}) => ({
    recommendation: { action, reason: "because" },
    discountAnalysis: classification ? { classification, reason: "why" } : undefined,
    ...extra,
  });

  it("shows the recommendation, then any warnings", () => {
    const badges = cardBadges(offer("GOOD_DEAL", "suspicious"));
    expect(badges.map((b) => b.label)).toEqual(["Good deal", "Suspicious discount"]);
    expect(badges[0].reason).toBe("because");
  });

  it("never shows a good recommendation next to a fake discount: the warning replaces it", () => {
    const badges = cardBadges(offer("GOOD_DEAL", "likely_fake"));
    expect(badges.map((b) => b.label)).toEqual(["Fake discount"]);
    expect(cardBadges(offer("BUY_NOW", "likely_fake")).map((b) => b.label)).toEqual(["Fake discount"]);
  });

  it("keeps a cautious recommendation next to a bad flag (they agree)", () => {
    expect(cardBadges(offer("OVERPRICED", "likely_fake")).map((b) => b.label)).toEqual(["Overpriced", "Fake discount"]);
    expect(cardBadges(offer("WAIT", "likely_fake")).map((b) => b.label)).toEqual(["Wait", "Fake discount"]);
  });

  it("does not let an unusual price (caution) remove a good recommendation", () => {
    const labels = cardBadges({ ...offer("GOOD_DEAL"), priceCheck: { status: "suspect_low", reason: "far below" } }).map((b) => b.label);
    expect(labels).toEqual(["Good deal", "Unusual price"]);
  });

  it("limits the warnings shown, and falls back safely for an offer with no analysis", () => {
    const many = { ...offer("FAIR_PRICE", "suspicious"), discountAnomaly: { isAnomalous: true }, priceCheck: { status: "suspect_high" } };
    expect(cardBadges(many)).toHaveLength(3); // recommendation + 2 warnings
    expect(cardBadges(many, { maxFlags: 1 })).toHaveLength(2);
    expect(cardBadges({}).map((b) => b.label)).toEqual(["Not enough history"]);
    expect(cardBadges(undefined).map((b) => b.label)).toEqual(["Not enough history"]);
  });
});
