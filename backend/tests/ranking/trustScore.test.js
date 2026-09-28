import { describe, it, expect } from "vitest";
import { calculateTrustScore, canonicalPlatform, PLATFORM_TRUST_SCORES, DEFAULT_TRUST } from "../../src/ranking/scores/trustScore.js";

describe("canonicalPlatform", () => {
  it("resolves both scraper output and seeded-data casing to the same key", () => {
    // Scraper output ("priceoye") and seeded/display data ("PriceOye",
    // "Mega.pk") must resolve identically, or seeded listings silently
    // fall to the default trust score.
    expect(canonicalPlatform("priceoye")).toBe("priceoye");
    expect(canonicalPlatform("PriceOye")).toBe("priceoye");
    expect(canonicalPlatform("Mega.pk")).toBe("mega");
  });

  it("resolves domain-style names via the alias map", () => {
    expect(canonicalPlatform("megapk")).toBe("mega");
    expect(canonicalPlatform("shophivecom")).toBe("shophive");
  });
});

describe("calculateTrustScore", () => {
  it("scores each known platform at its documented trust value", () => {
    for (const [platform, trust] of Object.entries(PLATFORM_TRUST_SCORES)) {
      expect(calculateTrustScore(platform, 20)).toBeCloseTo(trust * 20, 2);
    }
  });

  it("falls back to the default trust score for an unrecognized platform", () => {
    expect(calculateTrustScore("some-new-store", 20)).toBeCloseTo(DEFAULT_TRUST * 20, 2);
  });

  it("is case- and punctuation-insensitive (seeded vs scraped platform casing)", () => {
    expect(calculateTrustScore("PriceOye", 20)).toBe(calculateTrustScore("priceoye", 20));
  });
});
