// Formal Vitest version of the 18 hand-labeled cases in test-grouping.js
// (kept as-is at the repo root as a standalone diagnostic script -- this is
// the same data with real assertions instead of console.log, so it can run
// in CI/`npm test` rather than needing to be read by a human each time.
import { describe, it, expect } from "vitest";
import { isSimilarProduct } from "../src/services/similarity.service.js";

const CASES = [
  ["Apple iPhone 15 128GB PTA Approved", "iPhone 15 128GB PTA Approved", true, "same phone, same PTA"],
  ["Apple iPhone 16 Pro Max 256GB PTA Approved", "Apple iPhone 16 Pro Max 256GB NON PTA", false, "PTA vs non-PTA"],
  ["Apple iPhone 17 Pro 256GB", "Apple iPhone 17 Pro 1TB", false, "different capacity"],
  ["Apple iPhone 17 Pro 256GB", "Apple iPhone 17 Pro Max 256GB", false, "Pro vs Pro Max"],
  ["Apple iPhone 15 128GB", "Apple iPhone 16 128GB", false, "different generation"],
  ["Samsung 65 Inch QN70F Neo QLED 4K AI Smart TV 2025", "Samsung 85 Inch QN70F Neo QLED 4K AI Smart TV 2025", false, "65 vs 85 inch"],
  ["Samsung 75 Inch QN85F Neo QLED 4K AI Smart TV", "Samsung 75 Inch QN70F Neo QLED 4K AI Smart TV", false, "QN85F vs QN70F"],
  ["Samsung 65 Inch QN70F Neo QLED 4K Smart TV", "Samsung 65 Inch QN70F Neo QLED TV", true, "same model, same size"],
  ["Apple iPad Air M4 256GB", "Apple iPad Air M3 256GB", false, "M3 vs M4"],
  ["Apple iPad Air M4 256GB", "iPad Air M4 256 GB", true, "same iPad"],
  ["Apple iPad Air M4 256GB WiFi", "Apple iPad Air M4 256GB Cellular", false, "WiFi vs Cellular"],
  ["HP Victus 15-FA2787NR Gaming Laptop", "HP Victus 15-FA2100TU Gaming Laptop", false, "different laptop SKU"],
  ["Samsung Galaxy S24 Ultra 12GB 512GB", "Samsung Galaxy S24 Ultra 512GB", true, "RAM stated on one"],
  ["Samsung 65\" QN70F Neo QLED 4K AI Smart TV", "Samsung 75\" QN70F Neo QLED 4K AI Smart TV", false, "65 vs 75 inch, quote mark"],
  ["Samsung 65\" QN70F Neo QLED 4K AI Smart TV", "Samsung 65 Inch QN70F Neo QLED 4K AI Smart TV", true, "quote vs word, same size"],
  ["Apple iPhone 17 Pro Max 1TB Storage PTA Approved", "Apple iPhone 17 Pro Max 1TB PTA Approved", true, "same PTA status"],
  ["Apple iPhone 15", "Apple iPhone 15 128GB PTA Approved", false, "bare vs specific, unproven"],
  ["Apple iPhone 16 Pro Max", "Apple iPhone 16 Pro Max 256GB Single Sim PTA Approved", false, "bare vs 256GB PTA"],
];

describe("isSimilarProduct (18 hand-labeled grouping cases)", () => {
  it.each(CASES)("%s vs %s -> %s (%s)", (titleA, titleB, expected) => {
    expect(isSimilarProduct(titleA, titleB, 0.7)).toBe(expected);
  });
});
