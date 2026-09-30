import { describe, it, expect } from "vitest";
import {
  normalizeRating,
  normalizeReviewCount,
  normalizeSpecs,
  extractExtras,
} from "../src/services/scrapedExtras.service.js";
import { makeListing } from "../src/scrapers/scraper.schema.js";

describe("normalizeRating", () => {
  it("keeps a valid rating, rounded to one decimal", () => {
    expect(normalizeRating(4.5)).toBe(4.5);
    expect(normalizeRating("4.37")).toBe(4.4);
    expect(normalizeRating("4,5")).toBe(4.5);
    expect(normalizeRating(5)).toBe(5);
  });

  it("returns null when there is no rating, and never 0", () => {
    expect(normalizeRating(null)).toBeNull();
    expect(normalizeRating(undefined)).toBeNull();
    expect(normalizeRating("")).toBeNull();
    expect(normalizeRating(0)).toBeNull();
  });

  it("rejects values outside 0-5 instead of guessing the scale", () => {
    expect(normalizeRating(9)).toBeNull();
    expect(normalizeRating(87)).toBeNull();
    expect(normalizeRating(-1)).toBeNull();
    expect(normalizeRating("great")).toBeNull();
  });
});

describe("normalizeReviewCount", () => {
  it("accepts whole numbers, including formatted ones", () => {
    expect(normalizeReviewCount(128)).toBe(128);
    expect(normalizeReviewCount("1,234")).toBe(1234);
    expect(normalizeReviewCount(0)).toBe(0);
  });

  it("returns null for anything else", () => {
    expect(normalizeReviewCount(null)).toBeNull();
    expect(normalizeReviewCount("")).toBeNull();
    expect(normalizeReviewCount(-3)).toBeNull();
    expect(normalizeReviewCount(4.5)).toBeNull();
    expect(normalizeReviewCount("many")).toBeNull();
  });
});

describe("normalizeSpecs", () => {
  it("keeps a clean object", () => {
    expect(normalizeSpecs({ RAM: "8 GB", Storage: "256 GB" })).toEqual({ RAM: "8 GB", Storage: "256 GB" });
  });

  it("accepts arrays of label/value objects and of pairs", () => {
    expect(normalizeSpecs([{ label: "RAM", value: "8 GB" }])).toEqual({ RAM: "8 GB" });
    expect(normalizeSpecs([["Screen", "6.7 inch"]])).toEqual({ Screen: "6.7 inch" });
  });

  it("drops empty entries and tidies whitespace", () => {
    expect(normalizeSpecs({ "  Battery ": "  5000   mAh ", Empty: "", "": "x" })).toEqual({ Battery: "5000 mAh" });
  });

  it("makes labels safe as database keys", () => {
    const specs = normalizeSpecs({ "$where": "1", "Screen.size": "6.7" });
    expect(Object.keys(specs)).toEqual(["where", "Screen size"]);
  });

  it("caps entry count and text length", () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, "v"]));
    expect(Object.keys(normalizeSpecs(many))).toHaveLength(40);
    expect(normalizeSpecs({ Long: "x".repeat(1000) }).Long).toHaveLength(200);
  });

  it("returns null when nothing usable is left or the input is not an object", () => {
    expect(normalizeSpecs(null)).toBeNull();
    expect(normalizeSpecs("RAM 8GB")).toBeNull();
    expect(normalizeSpecs({})).toBeNull();
    expect(normalizeSpecs({ a: "" })).toBeNull();
  });
});

describe("scraper contract", () => {
  it("extractExtras validates all three fields at once", () => {
    expect(extractExtras({ rating: "4.2", reviewCount: "1,050", specs: { RAM: "8 GB" } })).toEqual({
      rating: 4.2, reviewCount: 1050, specs: { RAM: "8 GB" },
    });
    expect(extractExtras({})).toEqual({ rating: null, reviewCount: null, specs: null });
  });

  it("makeListing carries the optional fields and defaults them to null", () => {
    const base = { platform: "x", sourceUrl: "https://x.pk/p", title: "Phone", price: 100 };
    expect(makeListing(base)).toMatchObject({ rating: null, reviewCount: null, specs: null });
    expect(makeListing({ ...base, rating: 4.5, reviewCount: 10, specs: { RAM: "8 GB" } })).toMatchObject({
      rating: 4.5, reviewCount: 10, specs: { RAM: "8 GB" },
    });
  });
});
