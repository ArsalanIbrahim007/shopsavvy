// The product page's drop forecast (2026-11-07): only a price in the model's riskiest share is flagged, with the strict test's figures.
import { describe, it, expect } from "vitest";

import { dropChance } from "../src/services/dropChance.service.js";
import { FEATURE_NAMES } from "../src/ml/forecast/features.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-07T07:00:00Z");
const history = (prices) => prices.map((price, i) => ({ price, recordedAt: new Date(NOW - (prices.length - 1 - i) * DAY).toISOString(), inStock: true }));

// A model that scores by how often the price moved in the last 30 days ("changes30"), so a busy price is risky and a flat one is not.
const n = FEATURE_NAMES.length;
const artifact = {
  featureNames: FEATURE_NAMES,
  weights: FEATURE_NAMES.map((name) => (name === "changes30" ? 3 : 0)),
  bias: -4,
  means: Array(n).fill(0),
  stds: Array(n).fill(1),
  flag: { share: 0.05, threshold: 0.5, lift: 7.72, precision: 0.055, recall: 0.39 },
};
const busy = [100, 95, 100, 96, 101, 97, 100, 96, 99, 95];
const flat = Array(10).fill(100);
const listing = (prices, over = {}) => ({ productCategory: "smartphone", inStock: true, priceHistory: history(prices), ...over });

describe("dropChance", () => {
  it("flags a price the model ranks among its riskiest, with what the strict test showed", () => {
    expect(dropChance(listing(busy), artifact)).toEqual({ lift: 7.72, chance: 0.055, share: 0.05 });
  });

  it("says nothing for a price below the threshold", () => {
    expect(dropChance(listing(flat), artifact)).toBeNull();
  });

  it("says nothing without a week of records, out of stock, outside the trained categories, or with no strict test", () => {
    expect(dropChance(listing(busy.slice(-5)), artifact)).toBeNull(); // 4 days of records
    expect(dropChance(listing(busy, { inStock: false }), artifact)).toBeNull();
    expect(dropChance(listing(busy, { productCategory: "air_conditioner" }), artifact)).toBeNull();
    expect(dropChance(listing(busy), { ...artifact, flag: null })).toBeNull();
  });

  it("works with the real model file: a flag carries the strict test's figures, or there is none", () => {
    const result = dropChance(listing(busy));
    if (result) expect(result).toMatchObject({ share: 0.05, lift: expect.any(Number), chance: expect.any(Number) });
    else expect(result).toBeNull();
  });
});
