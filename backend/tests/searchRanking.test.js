// Which listings a broad search groups (2026-11-07): "tv" (5,117 listings) took 34 s and "a" ran into the worker's time limit.
import { describe, it, expect } from "vitest";

import { isSearchable, MAX_SEARCH_LISTINGS, selectSearchListings } from "../src/services/searchRanking.service.js";

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
