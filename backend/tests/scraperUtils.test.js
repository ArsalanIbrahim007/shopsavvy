import { describe, it, expect } from "vitest";
import { parsePrice, validatePricePair } from "../src/scrapers/scraper.utils.js";

describe("parsePrice", () => {
  it("parses a plain integer string", () => {
    expect(parsePrice("49999")).toBe(49999);
  });

  it("parses a PKR string with commas", () => {
    expect(parsePrice("PKR 49,999")).toBe(49999);
  });

  it("parses a Rs. string with decimal", () => {
    expect(parsePrice("Rs. 10,799.00")).toBe(10799);
  });

  it("parses a lakh format string", () => {
    expect(parsePrice("Rs. 1,49,999")).toBe(149999);
  });

  it("returns null for null input", () => {
    expect(parsePrice(null)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parsePrice("N/A")).toBeNull();
  });
});

describe("validatePricePair", () => {
  it("accepts a valid price with a higher was-price", () => {
    expect(validatePricePair(49999, 59999)).toEqual({
      price: 49999,
      originalPrice: 59999,
    });
  });

  it("nullifies a was-price that is below the current price", () => {
    expect(validatePricePair(49999, 39999)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("nullifies a was-price equal to the current price", () => {
    expect(validatePricePair(49999, 49999)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("accepts a null was-price and passes it through", () => {
    expect(validatePricePair(49999, null)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("nullifies a zero or negative price", () => {
    expect(validatePricePair(0, 59999)).toEqual({
      price: null,
      originalPrice: null,
    });
    expect(validatePricePair(-100, 59999)).toEqual({
      price: null,
      originalPrice: null,
    });
  });

  it("nullifies a price below PKR 100 (likely a parse error)", () => {
    // e.g. Telemart blog article priced at PKR 20
    expect(validatePricePair(20, null)).toEqual({
      price: null,
      originalPrice: null,
    });
  });

  it("nullifies a was-price more than 10x the current price (likely a misparse)", () => {
    // e.g. Telemart Haier TV: price 786999, was-price 11005000
    expect(validatePricePair(786999, 11005000)).toEqual({
      price: 786999,
      originalPrice: null,
    });
  });
});