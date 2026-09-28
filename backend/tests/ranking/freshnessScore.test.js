import { describe, it, expect } from "vitest";
import { calculateFreshnessScore } from "../../src/ranking/scores/freshnessScore.js";

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe("calculateFreshnessScore", () => {
  it("gives full marks within 24 hours", () => {
    expect(calculateFreshnessScore(hoursAgo(1), 10)).toBe(10);
    expect(calculateFreshnessScore(hoursAgo(24), 10)).toBe(10);
  });

  it("gives 75% within 72 hours", () => {
    expect(calculateFreshnessScore(hoursAgo(48), 10)).toBe(7.5);
  });

  it("gives 50% within 168 hours (one week)", () => {
    expect(calculateFreshnessScore(hoursAgo(100), 10)).toBe(5);
  });

  it("gives 25% beyond a week", () => {
    expect(calculateFreshnessScore(hoursAgo(24 * 30), 10)).toBe(2.5);
  });

  it("gives a neutral 50% when the scrape timestamp is missing entirely", () => {
    expect(calculateFreshnessScore(null, 10)).toBe(5);
    expect(calculateFreshnessScore(undefined, 10)).toBe(5);
  });
});
