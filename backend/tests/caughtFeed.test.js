// "Deals we didn't show you" (2026-11-07): the discounts the checks caught, from the cached catalogues.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/catalogFeed.service.js", () => ({
  CATALOG_CATEGORIES: ["smartphone", "tv"],
  peekCatalogGroups: vi.fn(),
}));

import { peekCatalogGroups } from "../src/services/catalogFeed.service.js";
import { caughtFromGroups, caughtOf, clearCaughtCache, getCaught, MAX_EXAMPLES } from "../src/services/caughtFeed.service.js";

let n = 0;
const offer = (platform, price, over = {}) => ({ _id: `o${++n}`, platform, price, originalPrice: null, title: `Product ${n}`, ...over });
const fake = (platform, price, was, over = {}) => offer(platform, price, {
  originalPrice: was,
  discountAnalysis: { classification: "likely_fake", metrics: { historicalHighest: price, historyCount: 9 } },
  ...over,
});
const anomalous = { discountAnomaly: { status: "anomalous", marketMax: 70000, comparators: 3 } };
const group = (productName, offers) => ({ productName, offers });

describe("caughtOf", () => {
  it("names what the checks said against an offer, or nothing", () => {
    expect(caughtOf(fake("mega", 100, 200))).toEqual({ fake: true, aboveMarket: false, unusual: false });
    expect(caughtOf(offer("mega", 100, anomalous))).toEqual({ fake: false, aboveMarket: true, unusual: false });
    expect(caughtOf(offer("mega", 100, { priceCheck: { status: "suspect_low" } }))).toEqual({ fake: false, aboveMarket: false, unusual: true });
    expect(caughtOf(offer("mega", 100, { discountAnalysis: { classification: "genuine_discount" }, discountAnomaly: { status: "consistent" } }))).toBeNull();
  });
});

describe("caughtFromGroups", () => {
  it("counts every catch, and shows the strongest with its evidence: both checks agreeing, then the bigger claim", () => {
    const strongest = fake("xcessorieshub", 59999, 749999, anomalous);
    const { counts, examples } = caughtFromGroups({
      smartphone: [
        group("Redmi Note 13 Pro", [strongest, offer("mega", 61000), offer("priceoye", 58899)]),
        group("Phone B", [fake("shophive", 50000, 90000)]), // 44% off, history only
        group("Phone C", [offer("mega", 1000, { priceCheck: { status: "suspect_low" } })]),
      ],
    });
    expect(counts).toEqual({ fakeDiscount: 2, aboveMarket: 1, unusualPrice: 1 });
    expect(examples.map((e) => e.productName)).toEqual(["Redmi Note 13 Pro", "Phone B"]); // the unusual price is counted, not shown
    expect(examples[0]).toMatchObject({
      platform: "xcessorieshub", price: 59999, originalPrice: 749999, claimedPercent: 92, category: "smartphone",
      caught: { fake: true, aboveMarket: true, unusual: false },
      history: { highest: 59999, checks: 9 }, market: { highest: 70000, stores: 3 }, lowestElsewhere: 58899,
    });
  });

  it("leaves out a claim of under 10% off, and keeps one example per product", () => {
    const { examples } = caughtFromGroups({ tv: [group("TV", [fake("mega", 95000, 100000), fake("mega", 50000, 100000), fake("priceoye", 40000, 100000)])] });
    expect(examples).toHaveLength(1);
    expect(examples[0].claimedPercent).toBe(60); // the biggest claim of the product
  });

  it("shows at most two from one store, and at most MAX_EXAMPLES", () => {
    const groups = Array.from({ length: 8 }, (_, i) => group(`P${i}`, [fake(i < 5 ? "priceoye" : `store${i}`, 1000, 5000 + i)]));
    const { examples } = caughtFromGroups({ smartphone: groups });
    expect(examples).toHaveLength(MAX_EXAMPLES);
    expect(examples.filter((e) => e.platform === "priceoye")).toHaveLength(2);
  });
});

describe("getCaught", () => {
  beforeEach(() => clearCaughtCache());

  it("reads only the catalogues already computed, and says which are missing", () => {
    vi.mocked(peekCatalogGroups).mockImplementation((c) => (c === "tv" ? null : { groups: [group("X", [fake("mega", 100, 300)])] }));
    const feed = getCaught({ now: Date.parse("2026-11-07T12:00:00Z") });
    expect(feed.missing).toEqual(["tv"]);
    expect(feed.counts.fakeDiscount).toBe(1);
    expect(feed.generatedAt).toBe("2026-11-07T12:00:00.000Z");
  });
});
