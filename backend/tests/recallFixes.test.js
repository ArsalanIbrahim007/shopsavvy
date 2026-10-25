// The two vetoes the recall sample found keeping one product apart (2026-10-26, GROUPING_RECALL.md). Titles are live ones.
import { describe, it, expect } from "vitest";

import { extractStorage } from "../src/services/normalizeTitle.service.js";
import { extractRamGb, extractStorageGb } from "../src/services/productAttributes.service.js";
import { attributeConflict, statedSizes, withoutSizePrefix } from "../src/services/similarity.service.js";
import { buildFeatureVector, FEATURE_NAMES } from "../src/ml/features.js";

const conflict = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });

describe("a capacity labelled RAM is not storage", () => {
  it("reads no storage from a title that states only the RAM (common at DigiMall)", () => {
    for (const read of [extractStorage, extractStorageGb]) {
      expect(read("Xiaomi Redmi Note 15 Pro 12GB RAM")).toBeNull();
      expect(read("REDMI NOTE 14 PRO 12GB RAM PTA APPROVED")).toBeNull();
      expect(read("Lenovo Laptop 16GB Memory")).toBeNull();
    }
    expect(extractRamGb("Xiaomi Redmi Note 15 Pro 12GB RAM")).toBe(12); // still read as RAM
  });

  it("still reads storage beside RAM, however it is written", () => {
    for (const read of [extractStorage, extractStorageGb]) {
      expect(read("Samsung Galaxy A17 8GB RAM 256GB Storage")).toBe(256);
      expect(read("Galaxy A17 8GB-RAM 256GB")).toBe(256);
      expect(read("HP 15 8GB RAM 512GB SSD")).toBe(512);
      expect(read("Apple iPhone 17 Pro 1TB")).toBe(1024);
    }
  });

  it("no longer keeps the RAM-only listing apart from the same phone with its storage", () => {
    expect(conflict("Xiaomi Redmi Note 15 Pro 512GB 12GB RAM White Titanium", "Xiaomi Redmi Note 15 Pro 12GB RAM")).toBe(false);
    expect(conflict("Samsung Galaxy A17 256GB 8GB RAM Black", "Samsung Galaxy A17 6GB RAM")).toBe(true); // RAM still compared
  });
});

describe("a television's model code with its screen size in front", () => {
  it("drops a leading number only when a title states it as the screen size", () => {
    expect(withoutSizePrefix(new Set(["98du9000"]), statedSizes("Samsung 98DU9000 98\" Crystal UHD", "Samsung 98 Inch DU9000"))).toEqual(new Set(["du9000"]));
    expect(withoutSizePrefix(new Set(["12t3"]), statedSizes("TCL 12T3 1 Ton", "TCL 18T3 1.5 Ton"))).toEqual(new Set(["12t3"])); // no size stated
    expect(withoutSizePrefix(new Set(["55du7000"]), statedSizes("Samsung 55DU7000 55 inch", "Samsung 65 Inch DU7000"))).toEqual(new Set(["du7000"]));
    // a size is stated, but the code's leading number is not it: the number names the model and stays
    expect(withoutSizePrefix(new Set(["43t5300"]), new Set(["55"]))).toEqual(new Set(["43t5300"]));
  });

  it("matches the same code with and without the size, and still tells sizes and models apart", () => {
    expect(conflict("Samsung 98 Inch 4K UHD Smart Crystal UHD TV (DU9000)", "Samsung 98DU9000 98\" Crystal UHD 4K Smart TV")).toBe(false);
    expect(conflict("Samsung 75 inch Crystal UHD 4K Smart TV (75U8000F)", "Samsung 75 Inch 4K UHD Smart Crystal UHD TV (U8000F)")).toBe(false);
    expect(conflict("Samsung 55DU7000 55 inch Smart TV", "Samsung 65 Inch DU7000 Smart TV")).toBe(true); // 55 against 65
    expect(conflict("Samsung 75 Inch Crystal UHD (75U8000F)", "Samsung 75 Inch Crystal UHD (75DU7000)")).toBe(true); // other model
  });

  it("tells the trained matcher the codes agree", () => {
    const at = FEATURE_NAMES.indexOf("modelCodeMatch");
    const plain = "Samsung 98 Inch 4K UHD Smart Crystal UHD TV (DU9000)";
    const prefixed = "Samsung 98DU9000 98\" Crystal UHD 4K Smart TV";
    // both ways round, so neither side's code is left with its size
    expect(buildFeatureVector({ titleA: plain, priceA: 1099999, titleB: prefixed, priceB: 1079999 })[at]).toBe(1);
    expect(buildFeatureVector({ titleA: prefixed, priceA: 1079999, titleB: plain, priceB: 1099999 })[at]).toBe(1);
  });
});
