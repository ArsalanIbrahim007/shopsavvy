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

  it("forces WAIT when the discount is flagged fake or suspicious, overriding an otherwise excellent score", () => {
    const result = generateRecommendation({
      price: 900,
      dealScore: 95,
      priceHistory: [{ price: 1000 }, { price: 1000 }, { price: 1000 }],
      discountAnalysis: { classification: "fake_discount" },
    });
    expect(result.action).toBe(RECOMMENDATION_ACTIONS.WAIT);
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
      priceHistory: [{ price: 1000 }, { price: 2000 }],
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
