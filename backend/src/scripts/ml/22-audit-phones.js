// 22-audit-phones.js — the phone category's grouping checked by each phone's identity (phoneIdentity.service.js: maker, model, 5G,
// RAM, storage, non-PTA), 2026-11-27. Groups every stored phone as the category and product pages do and lists:
//   SPLIT  one phone (one key) shown as two or more products, priced within GAP of each other
//   MIXED  one product holding listings of two phones (keys that differ in model, 5G, RAM, storage or PTA)
// Read-only. --off switches the phone-key pass off (SHOPSAVVY_NO_PHONE_KEY) to compare; --title limits the listings by a regex.
//
//   node src/scripts/ml/22-audit-phones.js [--off] [--top 30] [--title "galaxy a17"]
import "dotenv/config";
import mongoose from "mongoose";
import { groupListingsByProduct, titleCondition } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";
import { phoneKey } from "../../services/phoneIdentity.service.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (process.argv.includes("--off")) process.env.SHOPSAVVY_NO_PHONE_KEY = "1";
const GAP = 0.25;
const TOP = Number(arg("--top") ?? 25);

await mongoose.connect(process.env.MONGO_URI);
const listings = await mongoose.connection.db.collection("listings").find(
  { productCategory: "smartphone", inStock: { $ne: false }, ...(arg("--title") ? { title: { $regex: arg("--title"), $options: "i" } } : {}) },
  { projection: { title: 1, normalizedTitle: 1, price: 1, platform: 1, productCategory: 1, inStock: 1, ptaStatus: 1, condition: 1 } },
).toArray();
await mongoose.disconnect();

const started = Date.now();
const groups = groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const seconds = Math.round((Date.now() - started) / 1000);
// The phone and its condition: a used unit is a product apart on purpose (separateByCondition), not a split.
const conditionOf = (o) => (["used", "refurbished", "open_box"].includes(o.condition) ? o.condition : titleCondition(o.title) ?? "new");
const keyed = groups.map((g) => {
  const counts = new Map();
  for (const o of g.offers) { const k = phoneKey(o.title); if (k) { const kc = `${k}|${conditionOf(o)}`; counts.set(kc, (counts.get(kc) ?? 0) + 1); } }
  const key = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { g, key, keys: counts, middle: (g.lowestPrice + g.highestPrice) / 2, stores: new Set(g.offers.map((o) => o.platform)).size };
});

// SPLIT: one key, several products
const byKey = new Map();
for (const x of keyed) if (x.key) { if (!byKey.has(x.key)) byKey.set(x.key, []); byKey.get(x.key).push(x); }
const splits = [];
for (const [key, list] of byKey) {
  if (list.length < 2) continue;
  const near = list.filter((x) => list.some((y) => y !== x && Math.abs(x.middle - y.middle) / Math.max(x.middle, y.middle) <= GAP));
  if (near.length > 1) splits.push({ key, list: near });
}
splits.sort((a, b) => b.list.length - a.list.length);

// MIXED: several keys in one product (a key held by one offer of many may be a store's typo; listed all the same)
const mixed = keyed.filter((x) => x.keys.size > 1).sort((a, b) => b.g.offers.length - a.g.offers.length);

console.log(`smartphones: ${listings.length} listings -> ${groups.length} products (${seconds} s)${process.env.SHOPSAVVY_NO_PHONE_KEY ? " [phone-key pass OFF]" : ""}`);
console.log(`  products whose phone is known (maker, model, RAM, storage): ${keyed.filter((x) => x.key).length}`);
console.log(`  SPLIT: ${splits.length} phones shown as 2+ products, ${splits.reduce((n, s) => n + s.list.length - 1, 0)} products too many`);
console.log(`  MIXED: ${mixed.length} products hold 2+ phones`);
console.log(`\nSPLIT (most products first):`);
for (const s of splits.slice(0, TOP)) {
  console.log(`* ${s.key}: ${s.list.length} products`);
  for (const x of s.list) console.log(`    [${x.g.offers.length}, ${x.stores} st] ${x.g.productName.slice(0, 95)}  PKR ${x.g.lowestPrice}-${x.g.highestPrice}`);
}
console.log(`\nMIXED (largest first):`);
for (const x of mixed.slice(0, TOP)) {
  console.log(`* [${x.g.offers.length}] ${x.g.productName.slice(0, 90)}`);
  for (const [k, n] of x.keys) console.log(`    ${n} x ${k}`);
}
