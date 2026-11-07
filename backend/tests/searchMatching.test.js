// The search's close-spelling fallback (2026-11-07): "mosquito" found AirPods and "electric geasyer" found phones, TVs and air
// conditioners. Every word must now be in the title, with at most 0, 1 or 2 typos by its length.
import { describe, it, expect } from "vitest";

import { buildWholeWordPattern, fuzzyMatchIds, fuzzyTokenScore, typoDistance } from "../src/services/searchMatching.service.js";

const titles = [
  "Apple AirPods Pro 2nd Generation",
  "Samsung Galaxy A17 8GB 256GB",
  "Dell Latitude 5440 i7 16GB 512GB",
  "Haier 1.5 Ton Wall Mount Inverter AC",
  "Homage Water Dispenser 3 Taps Pressure",
  "Xiaomi Redmi Note 15 Pro",
  "Apple iPhone 17 Pro",
].map((title, i) => ({ _id: `t${i}`, title }));
const found = (query) => fuzzyMatchIds(query, titles).map((id) => titles.find((t) => t._id === id).title);

describe("typoDistance", () => {
  it("counts a swap of neighbouring letters as one typo", () => {
    expect(typoDistance("iphnoe", "iphone")).toBe(1);
    expect(typoDistance("geasyer", "geyser")).toBe(2);
    expect(typoDistance("mosquito", "mosquito")).toBe(0);
  });
});

describe("the close-spelling fallback", () => {
  it("finds nothing for a search whose words are not in any title", () => {
    expect(found("mosquito")).toEqual([]);
    expect(found("electric geasyer")).toEqual([]);
    expect(found("pressure washer gun")).toEqual([]); // two words of three in the water dispenser are not enough
  });

  it("still finds real typos", () => {
    expect(found("samsnug galxy a17")).toEqual(["Samsung Galaxy A17 8GB 256GB"]);
    expect(found("iphnoe 17")).toEqual(["Apple iPhone 17 Pro"]);
    expect(found("redmi noet 15")).toEqual(["Xiaomi Redmi Note 15 Pro"]);
    expect(found("dell lattitude")).toEqual(["Dell Latitude 5440 i7 16GB 512GB"]);
  });

  it("allows no typo in a short word, and none in a number or a model code", () => {
    expect(fuzzyTokenScore("gun", "Water gum")).toBe(0);
    expect(fuzzyTokenScore("iphone 16", "Apple iPhone 17 Pro")).toBe(0.5);
    expect(found("iphone 16")).toEqual([]);
    expect(fuzzyTokenScore("65u8k", "Tcl 65P8K Smart 4K Qled Tv")).toBe(0); // a Hisense model is not a TCL one
  });
});

describe("buildWholeWordPattern", () => {
  const matches = (query, title) => new RegExp(buildWholeWordPattern(query), "i").test(title);
  it("matches the search as whole words, never inside another word or number", () => {
    expect(matches("s23", "Samsung Galaxy S23 Ultra 256GB")).toBe(true);
    expect(matches("s23", "Dawlance DWGS 2316 Garment Steamer")).toBe(false);
    expect(matches("iphone17", "Apple iPhone 17 Pro")).toBe(true); // the missing space is still tolerated
    expect(matches("iphone 1", "Apple iPhone 15")).toBe(false);
    expect(matches("15+", "iPhone 15+ 128GB")).toBe(true);
  });
});
