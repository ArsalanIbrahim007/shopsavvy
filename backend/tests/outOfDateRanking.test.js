import { describe, it, expect } from "vitest";

import { calculateDealScores } from "../src/ranking/dealScore.js";
import { VISIBLE_PLATFORMS_FILTER, HIDE_AFTER_DAYS } from "../src/config/platforms.js";

const daysAgo = (d) => new Date(Date.now() - d * 864e5);

describe("an offer not checked for a week (2026-11-18)", () => {
  it("gets no price or freshness credit and is ranked below every current offer, however cheap", () => {
    const offers = [
      { _id: "old", platform: "priceoye", title: "Phone X 128GB", price: 50000, lastScrapedAt: daysAgo(9), inStock: true },
      { _id: "new", platform: "ishopping", title: "Phone X 128GB", price: 60000, lastScrapedAt: daysAgo(0.1), inStock: true },
    ];
    const ranked = calculateDealScores(offers);
    expect(ranked.map((o) => o._id)).toEqual(["new", "old"]);
    const old = ranked.find((o) => o._id === "old");
    expect(old).toMatchObject({ outOfDate: true, scoreBreakdown: { price: 0, freshness: 0 } });
    expect(old.dealScore).toBeLessThan(ranked[0].dealScore);
  });
});

describe("an offer not checked for 15 days", () => {
  it("is hidden: the filter asks for a check within the window, worked out each time it is used", () => {
    expect(HIDE_AFTER_DAYS).toBe(15);
    const cutoff = { ...VISIBLE_PLATFORMS_FILTER }.lastScrapedAt.$gte.getTime();
    expect(Math.abs(Date.now() - 15 * 864e5 - cutoff)).toBeLessThan(5000);
  });
});
