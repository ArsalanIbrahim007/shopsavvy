import { describe, it, expect } from "vitest";
import { calculateFakeDiscountScore, extractHistoricalPrices } from "../../src/ranking/scores/fakeDiscountScore.js";

describe("extractHistoricalPrices", () => {
  it("accepts a plain array of numbers", () => {
    expect(extractHistoricalPrices([100, 200, 300])).toEqual([100, 200, 300]);
  });

  it("accepts an array of {price} objects and other common field names", () => {
    expect(
      extractHistoricalPrices([{ price: 100 }, { currentPrice: 200 }, { amount: 300 }, { value: 400 }])
    ).toEqual([100, 200, 300, 400]);
  });

  it("drops invalid entries rather than throwing", () => {
    expect(extractHistoricalPrices([100, "not a number", null, -50, 200])).toEqual([100, 200]);
  });

  it("returns an empty array for non-array input", () => {
    expect(extractHistoricalPrices(undefined)).toEqual([]);
    expect(extractHistoricalPrices("nope")).toEqual([]);
  });
});

describe("calculateFakeDiscountScore", () => {
  it("returns insufficient_data with no usable current price", () => {
    const result = calculateFakeDiscountScore({ currentPrice: null });
    expect(result.classification).toBe("insufficient_data");
  });

  it("returns no_claimed_discount when there's no original price or it's not actually higher", () => {
    const noOriginal = calculateFakeDiscountScore({ currentPrice: 1000 });
    expect(noOriginal.classification).toBe("no_claimed_discount");
    expect(noOriginal.isFakeDiscount).toBe(false);

    const originalNotHigher = calculateFakeDiscountScore({ currentPrice: 1000, originalPrice: 900 });
    expect(originalNotHigher.classification).toBe("no_claimed_discount");
  });

  it("returns unverified_discount with fewer than 3 history entries, never claims fake", () => {
    const result = calculateFakeDiscountScore({
      currentPrice: 900,
      originalPrice: 1000,
      priceHistory: [1000],
    });
    expect(result.classification).toBe("unverified_discount");
    expect(result.isFakeDiscount).toBe(false);
    expect(result.confidence).toBe(30);
  });

  it("classifies a genuine discount as genuine when the claim matches real history", () => {
    // Reference price (median of history) is 1000; current price is 10%
    // below it, and the claimed original price matches history exactly --
    // nothing here should look suspicious.
    const result = calculateFakeDiscountScore({
      currentPrice: 900,
      originalPrice: 1000,
      priceHistory: [1000, 1000, 1000],
    });
    expect(result.classification).toBe("genuine_discount");
    expect(result.isFakeDiscount).toBe(false);
    expect(result.fakeDiscountRisk).toBe(0);
  });

  it("flags a likely-fake discount: inflated claimed price + current price not actually lower than history", () => {
    // Historical reference is 500. Claimed "original" of 700 is 40% above
    // that (inflated). Current price of 690 is barely under the claimed
    // original but is HIGHER than the real historical price -- a classic
    // "raise then discount" pattern.
    const result = calculateFakeDiscountScore({
      currentPrice: 690,
      originalPrice: 700,
      priceHistory: [500, 500, 500],
    });
    expect(result.classification).toBe("likely_fake");
    expect(result.isFakeDiscount).toBe(true);
    expect(result.fakeDiscountRisk).toBeGreaterThanOrEqual(70);
  });

  it("caps confidence at 95 regardless of how much history exists", () => {
    const longHistory = Array(50).fill(1000);
    const result = calculateFakeDiscountScore({
      currentPrice: 900,
      originalPrice: 1000,
      priceHistory: longHistory,
    });
    expect(result.confidence).toBeLessThanOrEqual(95);
  });
});
