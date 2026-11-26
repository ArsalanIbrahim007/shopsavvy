// Which listings a broad search groups (2026-11-07): "tv" (5,117 listings) took 34 s and "a" ran into the worker's time limit.
import { describe, it, expect } from "vitest";

import { groupRelevance, isSearchable, MAX_SEARCH_LISTINGS, selectSearchListings, storeCount } from "../src/services/searchRanking.service.js";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const DAY = 86400000;
let n = 0;
const listing = (title, over = {}) => ({
  _id: `id${++n}`, title, normalizedTitle: title.toLowerCase(), platform: "priceoye", productCategory: "tv", inStock: true,
  lastScrapedAt: new Date(NOW - DAY).toISOString(), ...over,
});

describe("isSearchable", () => {
  it("needs a run of two letters or digits", () => {
    for (const q of ["tv", "i7", "galaxy a17", "  iphone  ", "Samsung (55)"]) expect(isSearchable(q), q).toBe(true);
    for (const q of ["a", "1", "x y", "(a+)+$", "?!", "", undefined]) expect(isSearchable(q), String(q)).toBe(false);
  });
});

describe("selectSearchListings", () => {
  it("keeps a search that fits whole, as it was", () => {
    const listings = [listing("A"), listing("B")];
    expect(selectSearchListings(listings, { query: "tv", limit: 5, now: NOW })).toEqual({ listings, matched: 2 });
  });

  it("chooses the most relevant and keeps them in the database's order (cheapest first)", () => {
    const filler = Array.from({ length: 6 }, (_, i) => listing(`Samsung Smart TV ${i}`, { lastScrapedAt: new Date(NOW - 60 * DAY).toISOString(), inStock: false }));
    const exact = listing("Samsung 55 inch Crystal UHD TV");
    const accessory = listing("Remote for Samsung TV", { productCategory: "accessory" });
    const listings = [...filler.slice(0, 3), accessory, exact, ...filler.slice(3)];

    const { listings: chosen, matched } = selectSearchListings(listings, { query: "samsung tv", category: "tv", limit: 3, now: NOW });
    expect(matched).toBe(8);
    expect(chosen).toHaveLength(3);
    expect(chosen).toContain(exact); // every word, current, in stock
    expect(chosen).not.toContain(accessory); // an accessory, though it names both words
    expect(chosen.map((l) => listings.indexOf(l))).toEqual([...chosen.map((l) => listings.indexOf(l))].sort((a, b) => a - b));
  });

  it("puts a product more stores sell ahead of one sold by a single store", () => {
    const single = Array.from({ length: 4 }, (_, i) => listing(`Haier TV ${i}`));
    const shared = ["priceoye", "mega", "shophive"].map((platform) => listing("TCL 50 inch QLED TV", { platform }));
    const { listings: chosen } = selectSearchListings([...single, ...shared], { query: "tv", category: "tv", limit: 3, now: NOW });
    expect(chosen).toEqual(shared);
  });

  it("caps at MAX_SEARCH_LISTINGS by default", () => {
    const listings = Array.from({ length: MAX_SEARCH_LISTINGS + 50 }, (_, i) => listing(`TV ${i}`));
    const { listings: chosen, matched } = selectSearchListings(listings, { query: "tv", category: "tv", now: NOW });
    expect(chosen).toHaveLength(MAX_SEARCH_LISTINGS);
    expect(matched).toBe(MAX_SEARCH_LISTINGS + 50);
  });
});

// "HUAWEI GT 5 Pro" showed the GT 6 Pro, 7 Pro and 2 Pro above the GT 5 Pro (2026-11-26).
describe("groupRelevance: the product searched for first", () => {
  const group = (name, more = []) => ({ rawGroupKey: name, productName: name, offers: [{ title: name }, ...more.map((title) => ({ title }))] });

  it("puts the searched model above its neighbours, written glued or spaced", () => {
    const q = "HUAWEI GT 5 Pro";
    const exact = groupRelevance(group("HUAWEI Watch GT 5 Pro 46mm Smartwatch – Black"), q);
    expect(groupRelevance(group("Huawei Watch GT5 Pro 46mm"), q)).toBe(exact);
    for (const other of ["Huawei Watch GT 6 Pro 46mm SmartWatch", "Huawei Watch GT 7 Pro Smartwatch", "HUAWEI Watch GT 2 Pro Smart Watch – (Black)", "Huawei Watch GT 5 46mm"]) {
      expect(groupRelevance(group(other), q)).toBeLessThan(exact);
    }
  });

  it("counts a version word the search did not ask for against a product", () => {
    const q = "galaxy watch 8";
    expect(groupRelevance(group("Samsung Galaxy Watch 8 Classic 46mm"), q)).toBeLessThan(groupRelevance(group("Samsung Galaxy Watch 8 44mm"), q));
    expect(groupRelevance(group("Samsung Galaxy Watch 8 Classic 46mm"), "galaxy watch 8 classic")).toBeGreaterThan(groupRelevance(group("Samsung Galaxy Watch 8 44mm"), "galaxy watch 8 classic"));
    // "Ultra Slim" in a store's description is not the Ultra
    expect(groupRelevance(group("HUAWEI WATCH FIT 4 Smartwatch for Men Women, Ultra Slim, Black"), "huawei watch fit 4"))
      .toBe(groupRelevance(group("Huawei Watch Fit 4 Black"), "huawei watch fit 4") + 0);
  });

  it("puts used units, another maker's product and accessories below, unless the search asks for them (audit 2026-11-26)", () => {
    const newOne = groupRelevance(group("Samsung Galaxy S25 Ultra (12GB-256GB)"), "galaxy s25 ultra");
    expect(groupRelevance(group("Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New"), "galaxy s25 ultra")).toBeLessThan(newOne);
    expect(groupRelevance(group("Samsung Galaxy S25 Ultra Used 12GB 256GB"), "used galaxy s25 ultra")).toBeGreaterThan(0);
    expect(groupRelevance(group("Samsung Galaxy Watch Ultra 2 (47MM)"), "apple watch ultra 2"))
      .toBeLessThan(groupRelevance(group("Apple Watch Ultra 2 49MM Black Titanium Case With Black Ocean Band"), "apple watch ultra 2"));
    expect(groupRelevance(group("AirPods 4 Spigen Case"), "airpods 4")).toBeLessThan(groupRelevance(group("Apple AirPods 4 ANC"), "airpods 4"));
    expect(groupRelevance(group("AirPods 4 Spigen Case"), "airpods 4 case")).toBeGreaterThan(groupRelevance(group("Apple AirPods 4"), "airpods 4 case") - 8);
    // a watch's "Aluminum Case" or earbuds' "Charging Case" is the product, not an accessory
    expect(groupRelevance(group("Apple Watch Series 10 46mm Aluminum Case"), "apple watch series 10")).toBe(groupRelevance(group("Apple Watch Series 10 46mm"), "apple watch series 10"));
  });

  it("breaks a tie by the number of stores, then offers", () => {
    const g = (platforms) => ({ offers: platforms.map((platform) => ({ platform })) });
    expect(storeCount(g(["alfamall", "alfamall", "alfamall", "alfamall"]))).toBe(1);
    expect(storeCount(g(["priceoye", "mega", "alfamall"]))).toBe(3);
  });

  it("is the best of a product's titles, and 0 for an empty search", () => {
    expect(groupRelevance(group("Huawei Watch GT 5 Pro", ["Huawei GT5 Pro 46mm Titanium"]), "gt5 pro")).toBeGreaterThan(0);
    expect(groupRelevance(group("Anything"), "")).toBe(0);
  });
});
