import { describe, it, expect } from "vitest";

import { attributeConflict, extractVariants, isSimilarProduct } from "../src/services/similarity.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";

// Found 2026-10-01 when XcessoriesHub was added: "Redmi Note 14 Pro + 5G (12GB- 512GB)" (PKR 138,999) was grouped with the
// plain "Redmi Note 14 Pro 12GB 512GB" (PKR 100,999), because the trailing "+" was read as nothing.
describe("a plus sign after a model or tier word means Plus", () => {
  it("reads Pro+, Pro + and S25+ as the Plus variant", () => {
    expect(extractVariants("Redmi Note 14 Pro+ 5G")).toEqual(new Set(["pro", "plus"]));
    expect(extractVariants("Redmi Note 14 Pro + 5G (12GB- 512GB)")).toEqual(new Set(["pro", "plus"]));
    expect(extractVariants("Samsung Galaxy S25+ 256GB")).toEqual(new Set(["plus"]));
    expect(extractVariants("Galaxy A57+ 8GB")).toEqual(new Set(["plus"]));
    expect(extractVariants("Xiaomi 15 Ultra+")).toEqual(new Set(["ultra", "plus"]));
  });

  it("does not read the plus in '8GB + 256GB', '6GB+128GB' or a bundle word as a variant", () => {
    expect(extractVariants("Samsung Galaxy A17 (8GB + 256GB)").size).toBe(0);
    expect(extractVariants("Samsung Galaxy A17 6GB+128GB").size).toBe(0);
    expect(extractVariants("Xiaomi Redmi 15 5G + Free Gift")).toEqual(new Set());
    expect(extractVariants("Vivo V60 12GB+256GB")).toEqual(new Set());
  });

  it("separates Pro from Pro+ and S25 from S25+, and keeps Pro+ with Pro Plus", () => {
    expect(attributeConflict("Redmi Note 14 Pro 12GB 512GB", "Redmi Note 14 Pro+ 12GB 512GB")).toBe(true);
    expect(attributeConflict("Redmi Note 14 Pro 12GB-512GB", "Redmi Note 14 Pro + 5G (12GB- 512GB) Midnight Black")).toBe(true);
    expect(attributeConflict("Samsung Galaxy S25 256GB", "Samsung Galaxy S25+ 256GB")).toBe(true);
    expect(attributeConflict("Redmi Note 14 Pro+ 12GB 512GB", "Redmi Note 14 Pro Plus 12GB 512GB")).toBe(false);
    expect(attributeConflict("Samsung Galaxy S25+ 256GB", "Samsung Galaxy S25 Plus 256GB")).toBe(false);
    expect(isSimilarProduct("Redmi Note 14 Pro 12GB 512GB", "Redmi Note 14 Pro+ 12GB 512GB", 0.5)).toBe(false);
  });

  it("leaves the ordinary cases alone", () => {
    expect(attributeConflict("Samsung Galaxy A17 (8GB + 256GB)", "Samsung Galaxy A17 8GB 256GB")).toBe(false);
    expect(attributeConflict("Redmi Note 14 Pro 8GB 256GB", "Redmi Note 14 Pro(8GB- 256GB)")).toBe(false);
    expect(attributeConflict("Apple iPhone 15 Pro Max 256GB", "Apple iPhone 15 Pro Max 256GB PTA Approved")).toBe(false);
  });

  it("groups them apart in a real comparison, with the trained matcher too", () => {
    let n = 0;
    const listing = (platform, title, price) => ({ _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone", inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [] });
    const listings = [
      listing("shophive", "Xiaomi Redmi Note 14 Pro 12GB 512GB", 100999),
      listing("mega", "Xiaomi Redmi Note 14 Pro 12GB RAM 512GB Storage", 92999),
      listing("xcessorieshub", "Redmi Note 14 Pro + 5G (12GB- 512GB) Midnight Black", 138999),
      listing("eezepc", "Xiaomi Redmi Note 14 Pro Plus 5G 12GB 512GB", 141999),
    ];
    for (const strategy of [undefined, mlMatchStrategy]) {
      const groups = groupListingsByProduct(listings, { matchStrategy: strategy });
      const sets = groups.map((g) => g.offers.map((o) => o.platform).sort().join("+")).sort();
      expect(sets).toContain("mega+shophive");
      expect(sets.some((s) => s.includes("xcessorieshub") && s.includes("shophive"))).toBe(false);
    }
  });
});
