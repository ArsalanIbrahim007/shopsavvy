// The search's "fewer words" fallback (2026-11-24): a pasted store title with words no stored title has, or junk glued to the model
// number, found nothing because every word must match. The listings collection is a small in-memory stand-in here.
import { describe, expect, it, vi } from "vitest";

const ROWS = [
  { _id: "1", platform: "priceoye", title: "Audionic Airbud 550", price: 3995, productCategory: "headphones" },
  { _id: "2", platform: "ishopping", title: "Audionic Airbud 550 Slide Earbuds", price: 3999, productCategory: "headphones" },
  { _id: "3", platform: "mega", title: "Audionic Airbud 590 Earbuds", price: 4999, productCategory: "headphones" },
  { _id: "4", platform: "mega", title: "Samsung Galaxy A17 6GB 128GB", price: 68000, productCategory: "smartphone" },
];

// Just the parts of a MongoDB filter the search uses.
function matches(row, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$and") return cond.every((c) => matches(row, c));
    if (key === "$or") return cond.some((c) => matches(row, c));
    const value = row[key] ?? null;
    if (cond === null) return value === null;
    if (typeof cond !== "object") return value === cond;
    if (cond.$regex !== undefined) return new RegExp(cond.$regex, cond.$options).test(value ?? "");
    if (cond.$nin) return !cond.$nin.includes(value);
    if (cond.$ne !== undefined) return value !== cond.$ne;
    if (cond.$in) return cond.$in.map(String).includes(String(value));
    return true;
  });
}

vi.mock("../src/models/listing.model.js", () => ({
  default: {
    find: (filter) => {
      const found = ROWS.filter((row) => matches(row, filter));
      const query = { sort: () => query, lean: async () => found, then: (resolve, reject) => Promise.resolve(found).then(resolve, reject) };
      return query;
    },
  },
}));

const { findSearchListings } = await import("../src/controllers/search.controller.js");
const { buildWholeWordPattern } = await import("../src/services/searchMatching.service.js");
const { searchableText } = await import("../src/services/coreTitle.service.js");

async function search(q) {
  const text = searchableText(q, 100);
  return findSearchListings(text, { $or: [{ title: { $regex: buildWholeWordPattern(text), $options: "i" } }] });
}

describe("a search with words no title has", () => {
  it("finds the product from a pasted store title, by its leading words", async () => {
    const found = await search("Audionic Airbud 550 Quad MIC ENC Earbuds, Gaming Mode, IPx4 Water Proof TWS Wireless");
    expect(found.matchedBy).toBe("fewer_words");
    expect(found.searchedFor).toBe("Audionic Airbud 550");
    expect(found.listings.map((l) => l._id).sort()).toEqual(["1", "2"]); // not the Airbud 590
  });

  it("cuts junk glued to the model number", async () => {
    const found = await search("Audionic Airbud 550sdasdasd");
    expect(found.searchedFor).toBe("Audionic Airbud 550");
    expect(found.listings.map((l) => l._id).sort()).toEqual(["1", "2"]);
  });

  it("leaves a search that matches as it is", async () => {
    const found = await search("Audionic Airbud 550");
    expect(found.matchedBy).toBe("exact");
    expect(found.searchedFor).toBe(null);
  });

  it("never drops to a single word", async () => {
    const found = await search("Audionic Nothingmatches Here");
    expect(found.matchedBy).not.toBe("fewer_words");
  });
});
