import { describe, it, expect } from "vitest";
import { productNameFromTitle, buildSuggestions } from "../src/services/suggestions.service.js";

const row = (title, productCategory = "smartphone") => ({ title, productCategory });

describe("productNameFromTitle", () => {
  it("reduces a long store title to brand and model, keeping the store's casing", () => {
    expect(productNameFromTitle("Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved").text).toBe("Samsung Galaxy A17");
    expect(productNameFromTitle("Apple iPhone 17 Pro Max 256GB Storage NON PTA").text).toMatch(/iPhone 17 Pro Max/);
  });

  it("gives the same key to the same product written two ways", () => {
    const a = productNameFromTitle("Samsung Galaxy A17 8GB 256GB");
    const b = productNameFromTitle("SAMSUNG GALAXY A17 (6GB-128GB)");
    expect(a.key).toBe(b.key);
  });

  it("never ends a name mid-phrase", () => {
    // Cut at the word limit these used to end on "Gen", "With", or a repeated screen size.
    expect(productNameFromTitle("Lenovo ThinkPad E16 Gen 3 Intel Core Ultra 5").text).toBe("Lenovo ThinkPad E16 Gen 3");
    expect(productNameFromTitle("Lenovo ThinkPad E14 14 Inches Core i7").text).toBe("Lenovo ThinkPad E14");
    expect(productNameFromTitle("Vivo Y31d With Official Warranty").text).toBe("Vivo Y31d");
    expect(productNameFromTitle("Lenovo Thinkpad E15 15.6 Inches Core i5").text).toBe("Lenovo Thinkpad E15");
    expect(productNameFromTitle("LENOVO THINKPAD T14 14TH GEN Intel Core Ultra 7").text).toBe("LENOVO THINKPAD T14");
    expect(productNameFromTitle("Samsung Galaxy Watch 8 40mm").text).toBe("Samsung Galaxy Watch 8");
  });

  it("caps the name at five words and returns null for nothing usable", () => {
    expect(productNameFromTitle("Lenovo ThinkPad E14 Gen 7 Intel Core Ultra 7 255H").text.split(" ").length).toBeLessThanOrEqual(5);
    expect(productNameFromTitle("")).toBeNull();
    expect(productNameFromTitle("128GB 256GB")).toBeNull();
  });
});

describe("buildSuggestions", () => {
  const rows = [
    row("Samsung Galaxy A17 8GB 256GB"),
    row("Samsung Galaxy A17 6GB 128GB PTA Approved"),
    row("Samsung Galaxy A17 5G"),
    row("Samsung Galaxy A57 5G 12GB 256GB"),
    row("Samsung Galaxy Watch 8 40mm", "smartwatch"),
    row("Samsung Galaxy Watch 8 44mm", "smartwatch"),
    row("Apple iPhone 17 Pro Max 256GB"),
    row("Apple iPhone 17 Pro 256GB"),
  ];

  it("ranks suggestions that start with what was typed first, then by how many listings share them", () => {
    const suggestions = buildSuggestions(rows, "galaxy a");
    expect(suggestions.map((s) => s.text)).toEqual(["Samsung Galaxy A17", "Samsung Galaxy A57"]);
    expect(suggestions[0].count).toBeGreaterThan(suggestions[1].count);
  });

  it("only suggests names that contain every typed piece", () => {
    expect(buildSuggestions(rows, "iphone 17").map((s) => s.text.toLowerCase().includes("iphone"))).toEqual([true, true]);
    expect(buildSuggestions(rows, "galaxy watch").every((s) => /watch/i.test(s.text))).toBe(true);
    expect(buildSuggestions(rows, "nokia")).toEqual([]);
  });

  it("reports the most common category for each name", () => {
    const watch = buildSuggestions(rows, "galaxy watch")[0];
    expect(watch.category).toBe("smartwatch");
    expect(watch.count).toBe(2);
  });

  it("respects the limit and dedupes equal products", () => {
    expect(buildSuggestions(rows, "samsung", { limit: 2 })).toHaveLength(2);
    const names = buildSuggestions(rows, "samsung").map((s) => s.text);
    expect(new Set(names).size).toBe(names.length);
  });

  it("completes words but does not match letters inside them", () => {
    // "a" starts "A17" and "A57" but is only a letter inside "watch".
    expect(buildSuggestions(rows, "galaxy a").some((s) => /watch/i.test(s.text))).toBe(false);
    // "wat" starts the word "watch".
    expect(buildSuggestions(rows, "galaxy wat").every((s) => /watch/i.test(s.text))).toBe(true);
  });

  it("is case-insensitive and ignores rows it cannot name", () => {
    expect(buildSuggestions([...rows, row("")], "GALAXY A17")).toHaveLength(1);
  });
});
