// test-grouping.js — checks grouping decisions against known cases
import { isSimilarProduct, calculateJaccardSimilarity } from "./src/services/similarity.service.js";
import { normalizeTitle, extractStorage, modelTokens } from "./src/services/normalizeTitle.service.js";

const CASES = [
  ["Apple iPhone 15", "Apple iPhone 15 128GB PTA Approved", true, "one states storage"],
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
];

let pass = 0;

CASES.forEach(([a, b, expected, why]) => {
  const actual = isSimilarProduct(a, b, 0.7);
  const ok = actual === expected;
  if (ok) pass++;

  console.log(`${ok ? "PASS" : "FAIL"}  ${why}`);
  console.log(`      "${a}"`);
  console.log(`      "${b}"`);
  console.log(
    `      storage ${extractStorage(a)} vs ${extractStorage(b)} | ` +
    `model "${modelTokens(a)}" vs "${modelTokens(b)}" | ` +
    `sim ${calculateJaccardSimilarity(modelTokens(a), modelTokens(b)).toFixed(2)} ` +
    `→ ${actual} (expected ${expected})\n`
  );
});

console.log(`${pass}/${CASES.length} passed`);