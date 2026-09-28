import { describe, it, expect } from "vitest";
import { calculatePriceScore, normalizeValue } from "../../src/ranking/scores/priceScore.js";

describe("calculatePriceScore", () => {
  it("gives the cheapest offer in a group full marks", () => {
    expect(calculatePriceScore(100, 100, 200, 60)).toBe(60);
  });

  it("gives the most expensive offer in a group zero", () => {
    expect(calculatePriceScore(200, 100, 200, 60)).toBe(0);
  });

  it("scores linearly between the group's min and max", () => {
    expect(calculatePriceScore(150, 100, 200, 60)).toBe(30);
  });

  it("gives a single-offer group a neutral score rather than full marks", () => {
    // Documented in the source: awarding full marks here made every
    // single-offer listing tie at the top of the ranking regardless of
    // price, since there is nothing to actually compare it against.
    expect(calculatePriceScore(150, 150, 150, 60)).toBe(30);
  });

  it("treats an invalid price as zero rather than throwing", () => {
    expect(calculatePriceScore(NaN, 100, 200, 60)).toBe(0);
    expect(calculatePriceScore(-50, 100, 200, 60)).toBe(0);
    expect(calculatePriceScore(0, 100, 200, 60)).toBe(0);
  });

  it("respects a custom weight", () => {
    expect(calculatePriceScore(100, 100, 200, 100)).toBe(100);
  });
});

describe("normalizeValue", () => {
  it("returns 0 for null/undefined", () => {
    expect(normalizeValue(null, 0, 100)).toBe(0);
    expect(normalizeValue(undefined, 0, 100)).toBe(0);
  });

  it("returns 1 when min equals max (nothing to normalize against)", () => {
    expect(normalizeValue(50, 50, 50)).toBe(1);
  });

  it("reverses the scale when asked (used for price, where lower is better)", () => {
    expect(normalizeValue(0, 0, 100, true)).toBe(1);
    expect(normalizeValue(100, 0, 100, true)).toBe(0);
  });
});
