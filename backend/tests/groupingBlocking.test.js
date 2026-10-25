// Blocking in groupListingsByProduct (2026-10-26): a listing is compared only with groups sharing a word with it. It must change
// nothing but the time: 3,146 phones took 186 s unblocked, past the grouping worker's 90 s, so the Smartphones catalog never loaded.
import { describe, it, expect } from "vitest";

import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";

const NOW = new Date().toISOString();
let n = 0;
const listing = (title, platform, price, over = {}) => ({
  _id: `id${n++}`, title, normalizedTitle: title.toLowerCase(), platform, price, inStock: true, condition: "new",
  ptaStatus: "unknown", lastScrapedAt: NOW, priceHistory: [], ...over,
});

// Live-style titles: the same phone written differently, capacity variants, a bare title that must choose between them (the
// group's title changes when a later listing states a capacity), PTA and non-PTA, unrelated products, and titles that
// normalise to nothing (brand words only).
const LISTINGS = [
  listing("Samsung Galaxy A17", "mega", 64500),
  listing("Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved", "priceoye", 64000),
  listing("Galaxy A17 8/256GB PTA", "shophive", 65000),
  listing("Samsung Galaxy A17 6GB 128GB", "alfamall", 52000),
  listing("Samsung Galaxy A17 128GB Dual Sim With Official Warranty", "digimall", 52500),
  listing("Samsung Galaxy A17 8GB RAM 256GB Storage NON PTA", "techroid", 56000),
  listing("Apple iPhone 17 Pro 256GB PTA Approved", "priceoye", 439999),
  listing("iPhone 17 Pro 256GB", "mega", 444999),
  listing("Apple iPhone 17 Pro Max 256GB", "mega", 478999),
  listing("Apple iPhone 17 Pro 512GB", "shophive", 520000),
  listing("Infinix Hot 60i 8GB 128GB", "priceoye", 38000),
  listing("Infinix Hot 60i 8+128", "mega", 38500),
  listing("Tecno Spark 40 8GB 256GB", "priceoye", 41000),
  listing("Redmi Note 15 Pro 8GB 256GB", "xcessorieshub", 85000),
  listing("Xiaomi Redmi Note 15 Pro 256GB", "mistore", 84999),
  listing("Redmi Note 15 Pro+ 12GB 512GB", "mistore", 115000),
  listing("Apple", "eezepc", 1000),
  listing("Samsung", "mega", 2000),
  listing("Apple", "priceoye", 1100),
];

const shape = (groups) => groups.map((g) => `${g.productName} | ${g.offers.map((o) => o._id).sort().join(",")}`);

describe("grouping with blocking", () => {
  for (const [name, matchStrategy] of [["rule", undefined], ["trained", mlMatchStrategy]]) {
    it(`makes exactly the groups the unblocked loop makes (${name} strategy)`, () => {
      const blocked = groupListingsByProduct(LISTINGS, { matchStrategy, blocking: true });
      const unblocked = groupListingsByProduct(LISTINGS, { matchStrategy, blocking: false });
      expect(shape(blocked)).toEqual(shape(unblocked));
      expect(blocked.length).toBeGreaterThan(5); // a real grouping, not everything apart or together
    });
  }

  it("asks the strategy far fewer times", () => {
    let calls = 0;
    const counting = (...args) => { calls++; return mlMatchStrategy(...args); };
    const many = Array.from({ length: 120 }, (_, i) => listing(`Brand${i} Model${i} ${i % 3 === 0 ? "8GB" : "Pro"}`, "mega", 1000 + i));

    groupListingsByProduct(many, { matchStrategy: counting, blocking: false });
    const unblocked = calls;
    calls = 0;
    groupListingsByProduct(many, { matchStrategy: counting, blocking: true });
    expect(unblocked).toBeGreaterThan(5000); // every listing against every group
    expect(calls).toBeLessThan(unblocked / 20);
  });
});
