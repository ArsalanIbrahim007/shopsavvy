// test-grouping.js — checks grouping decisions against known cases
import { isSimilarProduct, calculateJaccardSimilarity } from "./src/services/similarity.service.js";
import { normalizeTitle, extractStorage, modelTokens } from "./src/services/normalizeTitle.service.js";

const CASES = [
  ["Apple iPhone 15", "Apple iPhone 15 128GB PTA Approved", true, "same phone, one states storage"],
  ["Apple iPhone 15 128GB PTA Approved", "iPhone 15 128GB Official Warranty", true, "same phone + capacity"],
  ["Apple iPhone 17 Pro 256GB Storage PTA Approved", "Apple iPhone 17 Pro 1TB Storage PTA Approved", false, "different capacity"],
  ["Apple iPhone 17 Pro 256GB", "Apple iPhone 17 Pro Max 256GB", false, "Pro vs Pro Max"],
  ["Apple iPhone 15 128GB", "Apple iPhone 16 128GB", false, "different generation"],
  ["Samsung Galaxy S24 Ultra 12GB 512GB", "Samsung Galaxy S24 Ultra 512GB", true, "RAM stated on one"],
  ["Apple iPhone 17 Pro Max 1TB Storage NON PTA", "Apple iPhone 17 Pro Max 1TB Storage PTA Approved", true, "PTA status only"],
  ["Apple iPhone 17 Pro 256GB", "Apple iPhone 17 256GB", false, "Pro vs base model"],
  ["Samsung Galaxy S24 Ultra 512GB", "Samsung Galaxy S24 512GB", false, "Ultra vs base model"],
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