import { describe, it, expect } from "vitest";

import { fuzzyTokenScore, joinedWordPattern, splitCategoryWords } from "../src/services/searchMatching.service.js";

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
