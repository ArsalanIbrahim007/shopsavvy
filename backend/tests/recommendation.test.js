import { describe, it, expect } from "vitest";
import {
  generateRecommendation,
  attachRecommendation,
  attachRecommendations,
  RECOMMENDATION_ACTIONS,
} from "../src/services/recommendation/recommendation.service.js";

// Only generateRecommendation (and the attach* wrappers) are exported --
// determineRecommendationAction, calculateConfidence etc. are internal, so
// every case here goes through the same public surface the rest of the app
// actually calls.

describe("generateRecommendation", () => {
  it("returns NO_HISTORY when there isn't enough recorded history, regardless of deal score", () => {
    const result = generateRecommendation({ price: 1000, dealScore: 95, priceHistory: [] });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.NO_HISTORY);
  });

  // The discount check's own labels (fakeDiscountScore.js). Until 2026-11-12 these rules tested "fake_discount", which it never gives.
  it("forces WAIT when the discount is judged likely fake, overriding an otherwise excellent score", () => {
    const result = generateRecommendation({
      price: 900,
      dealScore: 95,
      priceHistory: [{ price: 1000 }, { price: 1000 }, { price: 1000 }],
      discountAnalysis: { classification: "likely_fake" },
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.WAIT);
  });

  it("a suspicious discount lowers the confidence and is named in the reason, but the price still decides", () => {
    const input = { price: 900, dealScore: 75, priceHistory: [{ price: 1000 }, { price: 1000 }] };
    const plain = generateRecommendation(input);
    const doubted = generateRecommendation({ ...input, discountAnalysis: { classification: "suspicious" } });
    expect(doubted.action).toBe(plain.action);
    expect(doubted.confidence).toBeLessThan(plain.confidence);
    expect(doubted.reason).toMatch(/discount looks exaggerated/);
  });

  it("recommends BUY_NOW only when score, recorded-low position, AND history depth all line up", () => {
    const result = generateRecommendation({
      price: 1000,
      dealScore: 90,
      priceHistory: [{ price: 1200 }, { price: 1150 }, { price: 1100 }, { price: 1050 }, { price: 1000 }],
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.BUY_NOW);
  });

  it("does not recommend BUY_NOW on a high score alone if history depth is under 5", () => {
    const result = generateRecommendation({
      price: 1000,
      dealScore: 90,
      priceHistory: [{ price: 1200 }, { price: 1000 }],
    });
    expect(result.action).not.toBe(RECOMMENDATION_ACTIONS.BUY_NOW);
  });

  it("recommends GOOD_DEAL for a solid but non-exceptional score", () => {
    const result = generateRecommendation({
      price: 900,
      dealScore: 75,
      priceHistory: [{ price: 1000 }, { price: 1000 }],
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.GOOD_DEAL);
  });

  it("recommends FAIR_PRICE for a middling score", () => {
    const result = generateRecommendation({
      price: 900,
      dealScore: 55,
      priceHistory: [{ price: 1000 }, { price: 1000 }],
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.FAIR_PRICE);
  });

  it("recommends WAIT for a weak score when the price isn't near its recorded high", () => {
    const result = generateRecommendation({
      price: 1200,
      dealScore: 40,
      priceHistory: [{ price: 1000 }, { price: 1500 }, { price: 2000 }, { price: 1800 }, { price: 1200 }], // five records: a history
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.WAIT);
  });

  it("recommends OVERPRICED for a poor score", () => {
    const result = generateRecommendation({
      price: 900,
      dealScore: 20,
      priceHistory: [{ price: 1000 }, { price: 1000 }],
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.OVERPRICED);
  });

  it("never returns a confidence outside 0-100", () => {
    const veryLow = generateRecommendation({ price: 900, dealScore: 0, priceHistory: [] });
    const veryHigh = generateRecommendation({
      price: 1000,
      dealScore: 100,
      trustScore: 100,
      priceHistory: Array(20).fill({ price: 1000 }),
    });
    expect(veryLow.confidence).toBeGreaterThanOrEqual(0);
    expect(veryLow.confidence).toBeLessThanOrEqual(100);
    expect(veryHigh.confidence).toBeGreaterThanOrEqual(0);
    expect(veryHigh.confidence).toBeLessThanOrEqual(100);
  });

  it("estimates savings from the original price when one is claimed", () => {
    const result = generateRecommendation({
      price: 900,
      originalPrice: 1000,
      dealScore: 75,
      priceHistory: [{ price: 1000 }, { price: 1000 }],
    });
    expect(result.estimatedSavings).toBe(100);
  });
});

describe("attachRecommendation / attachRecommendations", () => {
  it("adds a recommendation field without mutating the other listing fields", () => {
    const listing = { _id: "abc", price: 900, dealScore: 75, priceHistory: [{ price: 1000 }, { price: 1000 }] };
    const result = attachRecommendation(listing);
    expect(result._id).toBe("abc");
    expect(result.price).toBe(900);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.action).toBeDefined();
  });

  it("maps over an array and returns an empty array for non-array input", () => {
    const listings = [
      { price: 900, dealScore: 75, priceHistory: [{ price: 1000 }, { price: 1000 }] },
      { price: 500, dealScore: 20, priceHistory: [] },
    ];
    const results = attachRecommendations(listings);
    expect(results).toHaveLength(2);
    expect(results[1].recommendation.action).toBe(RECOMMENDATION_ACTIONS.NO_HISTORY);
    expect(attachRecommendations(null)).toEqual([]);
  });
});

describe("'Wait' needs a price history that says something (audit, 2026-11-12)", () => {
  it("two records at the same price give no 'Wait': there is not enough history", () => {
    const result = generateRecommendation({ price: 1000, dealScore: 40, priceHistory: [{ price: 1000 }, { price: 1000 }] });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.NO_HISTORY);
  });

  it("five records at one unchanged price give no 'Wait' either; five that moved do", () => {
    const flat = generateRecommendation({ price: 1000, dealScore: 40, priceHistory: Array(5).fill({ price: 1000 }) });
    expect(flat.action).toBe(RECOMMENDATION_ACTIONS.NO_HISTORY);
    const moved = generateRecommendation({
      price: 1000, dealScore: 40,
      priceHistory: [{ price: 900 }, { price: 950 }, { price: 1000 }, { price: 1050 }, { price: 1100 }],
    });
    expect(moved.action).toBe(RECOMMENDATION_ACTIONS.WAIT);
  });
});
