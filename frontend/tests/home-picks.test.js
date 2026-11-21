// The home page's picks, the hero's caught examples and the offer table's order (2026-11-21 interface review).
import { describe, it, expect } from "vitest";

import { pickDeals, pickMostCompared } from "../src/lib/homePicks.js";
import { showableExamples } from "../src/lib/caught.js";
import { countsForLowest, storeCountText } from "../src/lib/summary.js";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const group = (name, brand, checkedHoursAgo = 2) => ({ productName: name, offers: [{ brand, lastScrapedAt: hoursAgo(checkedHoursAgo) }] });

describe("pickMostCompared", () => {
  it("keeps at most two of a brand, in the server's order", () => {
    const groups = ["A", "B", "C", "D"].map((n) => group(`Xiaomi ${n}`, "xiaomi")).concat([group("Galaxy A17", "samsung"), group("iPhone 17", "apple")]);
    expect(pickMostCompared(groups, { now: NOW }).map((g) => g.productName)).toEqual(["Xiaomi A", "Xiaomi B", "Galaxy A17", "iPhone 17", "Xiaomi C"]);
  });

  it("leaves out products whose every price is more than two days old", () => {
    const groups = [group("MacBook Air (Paklap)", "apple", 72), group("Galaxy Book", "samsung", 3)];
    expect(pickMostCompared(groups, { now: NOW }).map((g) => g.productName)).toEqual(["Galaxy Book"]);
  });
});

describe("pickDeals", () => {
  it("fills two rows of five with at most three from one category, topping up when there are too few others", () => {
    const deals = Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, category: "headphones" })).concat([{ id: "tv", category: "tv" }]);
    expect(pickDeals(deals).map((d) => d.id)).toEqual(["h0", "h1", "h2", "tv", "h3", "h4", "h5", "h6", "h7"]);
    expect(pickDeals(Array.from({ length: 20 }, (_, i) => ({ id: i, category: `c${i}` })))).toHaveLength(10);
  });
});

describe("showableExamples", () => {
  const ex = (over) => ({ price: 1499, originalPrice: 8000, history: { highest: 1899 }, market: { highest: 1849 }, ...over });
  it("keeps a believable caught discount", () => {
    expect(showableExamples([ex()])).toHaveLength(1);
  });
  it("leaves out a store's typo and a card that would contradict itself", () => {
    expect(showableExamples([ex({ price: 59999, originalPrice: 749999, history: { highest: 59999 }, market: { highest: 77299 } })])).toHaveLength(0);
    expect(showableExamples([ex({ price: 1349, originalPrice: 5999, history: { highest: 1348 } })])).toHaveLength(0);
  });
});

describe("the offer table's order and the card's store line", () => {
  it("counts only in-stock, current, PTA-stated, believable offers for the lowest price", () => {
    const fresh = { price: 1, lastScrapedAt: new Date().toISOString() };
    expect(countsForLowest(fresh)).toBe(true);
    expect(countsForLowest({ ...fresh, inStock: false })).toBe(false);
    expect(countsForLowest({ ...fresh, ptaAssessment: "unstated_cheap" })).toBe(false);
    expect(countsForLowest({ ...fresh, priceCheck: { status: "suspect_low" } })).toBe(false);
    expect(countsForLowest({ ...fresh, lastScrapedAt: new Date(Date.now() - 30 * 86400000).toISOString() })).toBe(false);
  });
  it("says how many stores in plain words", () => {
    expect(storeCountText(11)).toBe("Compared at 11 stores");
    expect(storeCountText(1)).toBe("Only at this store");
  });
});
