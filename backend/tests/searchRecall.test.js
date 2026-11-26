import { describe, it, expect } from "vitest";

import { fuzzyTokenScore, joinedWordPattern, modelNumberWords, searchWordPattern, splitCategoryWords } from "../src/services/searchMatching.service.js";

describe("search recall (audit S-001, 2026-11-18)", () => {
  it("takes a category word as the category, not a title word", () => {
    expect(splitCategoryWords(["samsung", "phone"])).toEqual({ words: ["samsung"], category: "smartphone" });
    expect(splitCategoryWords(["dawlance", "ac"])).toEqual({ words: ["dawlance"], category: "air_conditioner" });
    expect(splitCategoryWords(["haier", "washing", "machine"])).toEqual({ words: ["haier"], category: "washing_machine" });
    expect(splitCategoryWords(["phone"])).toEqual({ words: ["phone"], category: null }); // nothing else to search for
    expect(splitCategoryWords(["iphone", "17"])).toEqual({ words: ["iphone", "17"], category: null });
  });

  it("matches a joined word split by a space or hyphen", () => {
    const re = (w) => new RegExp(joinedWordPattern(w), "i");
    expect(re("galaxytab").test("Samsung Galaxy Tab A9 4GB")).toBe(true);
    expect(re("sonywh1000xm4").test("Sony WH-1000XM4 Wireless")).toBe(true);
    expect(re("thinkpadx1").test("Lenovo ThinkPad X1 Carbon")).toBe(true);
    expect(re("galaxytab").test("Galaxy Tablet")).toBe(false);
  });

  it("lets a 3-letter word miss one letter or swap two, never change one", () => {
    expect(fuzzyTokenScore("gre 1.5 ton", "Gree 1.5 Ton Inverter AC")).toBe(1);
    expect(fuzzyTokenScore("ipad ari", "Apple iPad Air M2")).toBe(1);
    expect(fuzzyTokenScore("del 24", "Dell 24 Monitor")).toBe(1);
    expect(fuzzyTokenScore("gun", "Sun glasses")).toBe(0);
  });
});

describe("which searches are worth asking every store about (audit S-013)", () => {
  it("not a link, markup, a very long text or an endless word", async () => {
    const { worthAskingStores } = await import("../src/services/searchRanking.service.js");
    expect(worthAskingStores("samsung galaxy a17")).toBe(true);
    expect(worthAskingStores("<script>alert(1)</script>")).toBe(false);
    expect(worthAskingStores("https://www.amazon.com/dp/B0CHX1W1XY")).toBe(false);
    expect(worthAskingStores("a".repeat(30))).toBe(false);
    expect(worthAskingStores("x ".repeat(50))).toBe(false);
  });
});

describe("a search waits for the stores at most MISSING_WAIT_MS (audit 2026-11-18: 'HP 22f' waited 306 s)", () => {
  it("answers when the stores are slow, and leaves them running", async () => {
    const { MISSING_WAIT_MS } = await import("../src/services/scraper.service.js");
    expect(MISSING_WAIT_MS).toBe(25000);
  }, 30000); // importing the scrapers is slow under load
});

describe("a model code searched with its size (audit S-006)", () => {
  it("also matches the code without the size and with region letters, never another size's code", async () => {
    const { searchWordPattern, sizedModelCode } = await import("../src/services/searchMatching.service.js");
    const re = new RegExp(searchWordPattern("55u8000f"), "i");
    expect(re.test("SAMSUNG 55 Inches 4K Uhd Smart TV | 55U8000F")).toBe(true);
    expect(re.test("Samsung 55\" Crystal UHD U8000F 4K Smart TV 2025 (UA55U8000FUSMM)")).toBe(true);
    expect(re.test("Samsung 55 Inch Crystal UHD 4K Smart LED TV (U8000F)")).toBe(true);
    expect(re.test("Samsung 43U8000F")).toBe(false);
    expect(sizedModelCode("iphone17")).toBe(null);
    expect(sizedModelCode("55c6k")).toEqual({ size: 55, code: "c6k" });
  });
});

// "HUAWEI GT 5 Pro" was searched as "huawei gt pro": a one-character word was dropped, and the GT 2, 6 and 7 Pro came up too (2026-11-26).
describe("a model's one-digit number is searched with its word", () => {
  const isBrand = (word) => ["huawei", "haier", "samsung", "dawlance"].includes(word.toLowerCase());
  it("keeps the number on a model word, not on a brand or before a unit", () => {
    expect(modelNumberWords(["HUAWEI", "GT", "5", "Pro"], isBrand)).toEqual(["HUAWEI", "GT 5", "Pro"]);
    expect(modelNumberWords(["galaxy", "buds", "3", "pro"], isBrand)).toEqual(["galaxy", "buds 3", "pro"]);
    expect(modelNumberWords(["haier", "1", "ton", "inverter"], isBrand)).toEqual(["haier", "ton", "inverter"]);
    expect(modelNumberWords(["dawlance", "9", "kg"], isBrand)).toEqual(["dawlance", "kg"]);
    expect(modelNumberWords(["iphone", "17", "pro"], isBrand)).toEqual(["iphone", "17", "pro"]);
    // a brand word that is a product line keeps its number before a word ("pixel" reads as a brand); a rating does not
    expect(modelNumberWords(["pixel", "9", "pro"], (w) => w === "pixel")).toEqual(["pixel 9", "pro"]);
    expect(modelNumberWords(["samsung", "5", "star"], isBrand)).toEqual(["samsung", "star"]);
  });
  it("finds the model glued, spaced or hyphenated, and not a number elsewhere in the title", () => {
    const finds = (word, title) => new RegExp(searchWordPattern(word), "i").test(title);
    for (const title of ["Huawei Watch GT5 Pro 46mm", "HUAWEI Watch GT 5 Pro", "Huawei GT-5"]) {
      expect(finds("gt 5", title)).toBe(true);
      expect(finds("gt5", title)).toBe(true);
    }
    expect(finds("gt 5", "HUAWEI Watch GT 2 Pro 5 ATM")).toBe(false);
    expect(finds("gt 5", "GT 52")).toBe(false);
    expect(finds("s23", "Dawlance DWGS 2316")).toBe(false); // a one-letter code stays as it was
  });
});
