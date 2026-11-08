// The fair price for a listing's specs (2026-11-08): a ridge linear regression on log price, per category, trained on our listings
// (scripts/ml/fairPrice/01-train-evaluate.js). These tests use the trained artifact as shipped.
import { describe, it, expect } from "vitest";

import { fitRidge, predictRidge } from "../src/ml/ridge.js";
import { fairPriceOf, fairPriceScore, reliableCategories } from "../src/services/fairPrice.service.js";
import { calculateDealScores } from "../src/ranking/dealScore.js";
import { fairPriceEvaluation } from "../src/services/evaluationReport.service.js";

describe("fitRidge", () => {
  it("recovers a linear relation from sparse rows, and shrinks weights as the penalty grows", () => {
    // y = 2 + 3·x0 − 1·x1
    const rows = [[[0, 1]], [[1, 1]], [[0, 1], [1, 1]], [[0, 2]], [[1, 2]], [[0, 2], [1, 1]]];
    const y = rows.map((r) => 2 + r.reduce((s, [i, v]) => s + (i === 0 ? 3 : -1) * v, 0));
    const loose = fitRidge(rows, y, 2, { lambda: 1e-6 });
    for (const [i, row] of rows.entries()) expect(predictRidge(row, loose)).toBeCloseTo(y[i], 3);
    const tight = fitRidge(rows, y, 2, { lambda: 100 });
    expect(Math.abs(tight.weights[0])).toBeLessThan(Math.abs(loose.weights[0]));
  });
});

describe("the shipped fair-price model", () => {
  it("is used only where it beat both simple baselines on unseen products, so not for headphones", () => {
    const used = reliableCategories().map((c) => c.category);
    expect(used).toEqual(expect.arrayContaining(["smartphone", "tv", "air_conditioner", "refrigerator"]));
    expect(used).not.toContain("headphones");
    for (const c of reliableCategories()) expect(c.medianError).toBeLessThanOrEqual(0.22);
  });

  it("prices a bigger storage higher, and an AC of more tons higher", () => {
    const phone = (title) => fairPriceOf({ title, productCategory: "smartphone", platform: "priceoye", condition: "new", ptaStatus: "pta_approved" });
    expect(phone("Samsung Galaxy A17 8GB 256GB").price).toBeGreaterThan(phone("Samsung Galaxy A17 6GB 128GB").price);
    const ac = (title) => fairPriceOf({ title, productCategory: "air_conditioner", platform: "alfamall", condition: "new" });
    expect(ac("Gree 2 Ton Inverter Split AC").price).toBeGreaterThan(ac("Gree 1 Ton Inverter Split AC").price);
  });

  it("gives a range around its estimate, and says nothing for a used product, an untrusted category or an unknown title", () => {
    const fair = fairPriceOf({ title: "Apple iPhone 17 Pro Max 256GB PTA Approved", productCategory: "smartphone", platform: "mega", condition: "new" });
    expect(fair.low).toBeLessThan(fair.price);
    expect(fair.high).toBeGreaterThan(fair.price);
    expect(fairPriceOf({ title: "Apple iPhone 17 Pro Max 256GB", productCategory: "smartphone", platform: "mega", condition: "used" })).toBeNull();
    expect(fairPriceOf({ title: "Sony WH-1000XM6 Headphones", productCategory: "headphones", platform: "mega", condition: "new" })).toBeNull();
    expect(fairPriceOf({ title: "Zyxwv Qwertz Plonk", productCategory: "smartphone", platform: "mega", condition: "new" })).toBeNull();
  });
});

describe("the model's abstention", () => {
  it("says nothing for a listing whose own price is far outside the range it expects (a rare 98-inch TV)", () => {
    const tv = { title: "Samsung UA98DU9000U 98-Inch Crystal UHD 4K Smart TV", productCategory: "tv", platform: "eezepc", condition: "new" };
    const estimate = fairPriceOf(tv); // no price given: the estimate alone
    expect(estimate).not.toBeNull();
    expect(fairPriceOf({ ...tv, price: Math.round(estimate.high * 1.5) })).toBeNull();
    expect(fairPriceOf({ ...tv, price: estimate.price })).toEqual(estimate);
  });
});

describe("fairPriceScore", () => {
  const fair = { price: 100000, medianError: 0.1 };
  it("is a half at the fair price, full well below it, nothing well above it", () => {
    expect(fairPriceScore(100000, fair)).toBeCloseTo(0.5);
    expect(fairPriceScore(80000, fair)).toBe(1);
    expect(fairPriceScore(120000, fair)).toBe(0);
    expect(fairPriceScore(90000, fair)).toBeCloseTo(0.75);
    expect(fairPriceScore(90000, null)).toBeNull();
  });
});

describe("the deal score's price part", () => {
  const offer = (platform, price, title = "Samsung Galaxy A17 8GB 256GB PTA Approved") => ({
    platform, price, title, productCategory: "smartphone", condition: "new", ptaStatus: "pta_approved", lastScrapedAt: new Date().toISOString(), inStock: true,
  });

  it("judges a product only one store sells against its fair price, instead of a neutral half", () => {
    const fair = fairPriceOf({ ...offer("mega", 1), price: undefined }).price; // the estimate alone
    const [cheap] = calculateDealScores([offer("mega", Math.round(fair * 0.8))]);
    const [dear] = calculateDealScores([offer("mega", Math.round(fair * 1.25))]);
    expect(cheap.scoreBreakdown.price).toBeGreaterThan(30); // more than the old neutral 30 of 60
    expect(dear.scoreBreakdown.price).toBeLessThan(30);
    expect(cheap.fairPrice.price).toBe(fair);
  });

  it("keeps the old rule where there is no trusted fair price", () => {
    const head = (platform, price) => ({ ...offer(platform, price, "Sony WH-1000XM6 Wireless Headphones"), productCategory: "headphones" });
    const [only] = calculateDealScores([head("mega", 90000)]);
    expect(only.scoreBreakdown.price).toBe(30);
    expect(only.fairPrice).toBeNull();
  });
});

describe("fairPriceEvaluation", () => {
  it("reports each category's held-out error against the baselines, and whether the site uses it", () => {
    const evaluation = fairPriceEvaluation({
      trainedAt: "2026-11-08T00:00:00Z",
      categories: {
        tv: { metrics: { mdape: 0.09, within15: 0.68, r2: 0.92, testListings: 1100, baselines: { brandStorage: { mdape: 0.51 }, category: { mdape: 0.56 } } } },
        headphones: { metrics: { mdape: 0.33, within15: 0.23, r2: 0.59, testListings: 700, baselines: { brandStorage: { mdape: 0.31 }, category: { mdape: 0.53 } } } },
      },
    });
    expect(evaluation.categories.map((c) => [c.category, c.used])).toEqual([["tv", true], ["headphones", false]]);
    expect(fairPriceEvaluation(null)).toBeNull();
  });
});

// 2026-11-08: a claimed discount the listing's own short history cannot judge is judged against the product's history at every
// store, then against the fair price for its specs; the verdict says which.
describe("judgeWithMoreEvidence", async () => {
  const { judgeWithMoreEvidence } = await import("../src/ranking/dealScore.js");
  const unverified = { classification: "unverified_discount", reason: "not enough history", metrics: {} };
  const day = (d) => `2026-10-${String(d).padStart(2, "0")}T06:00:00Z`;

  it("uses the product's history at every store when the listing's own is too short", () => {
    const pooledHistory = [1, 2, 3, 4, 5].map((d) => ({ price: 60000, recordedAt: day(d) }));
    const result = judgeWithMoreEvidence(unverified, { price: 60000, originalPrice: 120000 }, { pooledHistory });
    expect(result.basis).toBe("product_history");
    expect(["likely_fake", "suspicious"]).toContain(result.classification);
    expect(result.reason).toMatch(/at every store we track \(5 recorded prices\)/);
  });

  it("then the fair price: a 'was' price above its range is suspicious, one in line with it likely genuine, between stays unverified", () => {
    const fairPrice = { price: 100000, low: 80000, high: 130000, medianError: 0.1 };
    expect(judgeWithMoreEvidence(unverified, { price: 95000, originalPrice: 150000 }, { fairPrice })).toMatchObject({ classification: "suspicious", basis: "fair_price" });
    expect(judgeWithMoreEvidence(unverified, { price: 95000, originalPrice: 105000 }, { fairPrice })).toMatchObject({ classification: "possibly_genuine", basis: "fair_price" });
    expect(judgeWithMoreEvidence(unverified, { price: 95000, originalPrice: 120000 }, { fairPrice })).toMatchObject({ classification: "unverified_discount", basis: "listing_history" });
    expect(judgeWithMoreEvidence(unverified, { price: 95000, originalPrice: 150000 }, { fairPrice }).reason).toMatch(/PKR 150,000.*PKR 100,000.*PKR 130,000/);
  });

  it("leaves a verdict the listing's own history reached as it is", () => {
    const judged = { classification: "likely_fake", reason: "never sold that high" };
    expect(judgeWithMoreEvidence(judged, { price: 1, originalPrice: 2 }, { fairPrice: { price: 1, high: 1, medianError: 0.1 } })).toEqual({ ...judged, basis: "listing_history" });
  });
});

// 2026-11-08: the initial report promised ranking on price, rating, delivery and reliability; rating now counts in the trust part.
describe("the trust part with a product's rating", async () => {
  const { calculateTrustScore, ratingValue } = await import("../src/ranking/scores/trustScore.js");
  it("counts a rating only with enough reviews, a fifth of the trust part, and costs nothing without one", () => {
    expect(ratingValue(4.6, 3)).toBeNull(); // too few reviews
    expect(ratingValue(5, 12)).toBe(1);
    expect(ratingValue(2.5, 40)).toBe(0);
    const store = calculateTrustScore("mega", 20);
    expect(calculateTrustScore("mega", 20, { rating: 4.6, reviewCount: 2 })).toBe(store);
    expect(calculateTrustScore("mega", 20, { rating: 5, reviewCount: 50 })).toBeGreaterThan(store);
    expect(calculateTrustScore("mega", 20, { rating: 2.8, reviewCount: 50 })).toBeLessThan(store);
  });
});

describe("parseGroupingRecall", async () => {
  const { parseGroupingRecall } = await import("../src/services/evaluationReport.service.js");
  it("takes the latest live recall and pair precision (after a fix), and the first recall for comparison", () => {
    const text = `**Recall: 30.5%** (95% interval)\n| together (one product on the site) | 6,623 | 40 | 38 | 2 | 95.0% |\n| apart, similarity 0.8 or more | 8,888 | 50 | 3 | 47 | 6.0% |\n## After the fixes\n- **recall: 64.3%** (was the figure above)\n- **pair precision: 98.8%**; estimated`;
    expect(parseGroupingRecall(text)).toEqual({ recall: 64.3, pairPrecision: 98.8, labelledPairs: 90, firstRecall: 30.5, together: 40 });
    expect(parseGroupingRecall("")).toBeNull();
  });

  it("reads the shipped report", async () => {
    const { readFileSync } = await import("node:fs");
    const live = parseGroupingRecall(readFileSync("src/ml/GROUPING_RECALL.md", "utf8"));
    expect(live.recall).toBeGreaterThan(50);
    expect(live.pairPrecision).toBeGreaterThan(90);
  });
});
