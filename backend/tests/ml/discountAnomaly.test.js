import { describe, it, expect } from "vitest";
import { buildDiscountFeatures } from "../../src/ml/discountFeatures.js";
import {
  analyzeDiscountAnomaly,
  matchesFakeDiscountPattern,
  MAX_PRICE_OVER_MARKET,
} from "../../src/services/discountAnomaly.service.js";

const others = [
  { _id: "b", platform: "mega", price: 100000 },
  { _id: "c", platform: "shophive", price: 102000 },
  { _id: "d", platform: "daraz", price: 98000 },
];

describe("buildDiscountFeatures", () => {
  it("returns null when no discount is claimed", () => {
    const offer = { _id: "a", price: 100000, originalPrice: 100000 };
    expect(buildDiscountFeatures(offer, [offer, ...others])).toBeNull();
    expect(buildDiscountFeatures({ _id: "a", price: 100000 }, [...others])).toBeNull();
  });

  it("returns null when there is no other store to compare against", () => {
    const offer = { _id: "a", price: 90000, originalPrice: 120000 };
    expect(buildDiscountFeatures(offer, [offer])).toBeNull();
  });

  it("compares against the other offers only, never the offer itself", () => {
    const offer = { _id: "a", price: 90000, originalPrice: 200000 };
    const { context } = buildDiscountFeatures(offer, [offer, ...others]);
    expect(context.comparators).toBe(3);
    expect(context.marketMedian).toBe(100000);
    expect(context.marketMax).toBe(102000);
  });

  it("produces scale-free features: a phone and a TV at the same ratios match", () => {
    const phone = buildDiscountFeatures(
      { _id: "p", price: 50000, originalPrice: 100000 },
      [{ _id: "q", price: 50000 }]
    ).features;
    const tv = buildDiscountFeatures(
      { _id: "t", price: 500000, originalPrice: 1000000 },
      [{ _id: "u", price: 500000 }]
    ).features;
    phone.forEach((v, i) => expect(v).toBeCloseTo(tv[i], 10));
  });
});

describe("matchesFakeDiscountPattern", () => {
  it("requires the claimed original to exceed the market max", () => {
    expect(matchesFakeDiscountPattern([0.5, 0.2, 0, 0.3])).toBe(true);
    expect(matchesFakeDiscountPattern([0.1, -0.05, 0, 0.1])).toBe(false);
  });

  it("abstains when the store's own price is far above the market", () => {
    expect(matchesFakeDiscountPattern([0.9, 0.8, Math.log(MAX_PRICE_OVER_MARKET) + 0.01, 0.1])).toBe(false);
  });
});

describe("analyzeDiscountAnomaly (trained model)", () => {
  it("flags a 'was' price far above what every other store charges", () => {
    const offer = { _id: "a", price: 99000, originalPrice: 210000 };
    const result = analyzeDiscountAnomaly(offer, [offer, ...others]);
    expect(result.status).toBe("anomalous");
    expect(result.isAnomalous).toBe(true);
    expect(result.reason).toMatch(/above the highest price 3 other stores currently charge/);
  });

  it("treats a 'was' price in line with the market as consistent", () => {
    const offer = { _id: "a", price: 95000, originalPrice: 101000 };
    const result = analyzeDiscountAnomaly(offer, [offer, ...others]);
    expect(result.status).toBe("consistent");
    expect(result.isAnomalous).toBe(false);
  });

  it("abstains when the listing is priced like a different variant", () => {
    const offer = { _id: "a", price: 250000, originalPrice: 260000 };
    const result = analyzeDiscountAnomaly(offer, [offer, ...others]);
    expect(result.status).toBe("not_comparable");
    expect(result.isAnomalous).toBe(false);
  });

  it("returns null when there's nothing to judge", () => {
    const offer = { _id: "a", price: 95000 };
    expect(analyzeDiscountAnomaly(offer, [offer, ...others])).toBeNull();
  });
});
