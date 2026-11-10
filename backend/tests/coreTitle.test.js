// A marketplace title's product part (coreTitle.service.js), for the extension's lookup and for a pasted search (2026-11-10, Daraz).
import { describe, it, expect } from "vitest";

import { coreTitle, searchableText } from "../src/services/coreTitle.service.js";

describe("coreTitle", () => {
  it.each([
    ["Tecno Spark Go 3 - 6.75 Inches Display - 4GB RAM 64GB/128GB ROM - 8MP Front Camera - 13MP Rear Camera - Unisoc T7250 - Dual SIM - 5000mAh Battery", "Tecno Spark Go 3 4GB RAM"],
    ["Infinix Hot 60i - 6.78\" Display - 6GB RAM 128GB ROM - 50MP Camera - 5160mAh Battery", "Infinix Hot 60i 6GB RAM 128GB ROM"],
    ["Samsung Galaxy A17 - 5G - 8GB RAM 256GB - 6.7 inch Super AMOLED - 50MP", "Samsung Galaxy A17 5G 8GB RAM 256GB"],
    ["Xiaomi Redmi 15C - 4GB RAM - 128GB ROM - Helio G81 Ultra - 6000mAh", "Xiaomi Redmi 15C 4GB RAM 128GB ROM"],
  ])("%s -> %s", (title, core) => {
    expect(coreTitle(title)).toBe(core);
  });

  it("leaves a short title as it is", () => {
    expect(coreTitle("Redmi Note 14 Pro 8GB 256GB")).toBe("Redmi Note 14 Pro 8GB 256GB");
    expect(coreTitle("Apple iPhone 16 Pro Max 256GB | PTA Approved")).toBe("Apple iPhone 16 Pro Max 256GB | PTA Approved");
  });

  it("a search text is at most 100 characters, cut at a word", () => {
    const long = `Samsung Galaxy S26 Ultra ${"wonderful ".repeat(15)}`;
    expect(searchableText(long).length).toBeLessThanOrEqual(100);
    expect(searchableText(long).endsWith(" ")).toBe(false);
    expect(searchableText("Tecno Spark Go 3")).toBe("Tecno Spark Go 3");
  });
});
