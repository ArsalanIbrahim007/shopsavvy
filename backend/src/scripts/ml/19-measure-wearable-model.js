// 19-measure-wearable-model.js — what the wearable-model rule (similarityModel.service.js wearableModelKey, 2026-11-26) changes:
// groups every stored smartwatch and headphones listing with the live (trained) strategy, with and without the rule, and prints the
// group counts and every group the rule formed out of several, so each join can be read. Read-only.
//
//   node src/scripts/ml/19-measure-wearable-model.js [--category smartwatch] [--all]   (--all prints every join, not the first 60)
import "dotenv/config";
import mongoose from "mongoose";
import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const categories = arg("--category") ? [arg("--category")] : ["smartwatch", "headphones"];
const showAll = process.argv.includes("--all");

await mongoose.connect(process.env.MONGO_URI);
const listings = await mongoose.connection.db.collection("listings").find(
  { productCategory: { $in: categories }, inStock: { $ne: false } },
  { projection: { title: 1, normalizedTitle: 1, price: 1, platform: 1, productCategory: 1, inStock: 1, ptaStatus: 1, condition: 1, brand: 1 } },
).toArray();
await mongoose.disconnect();

function group(withRule) {
  if (withRule) delete process.env.SHOPSAVVY_NO_WEARABLE_MODEL;
  else process.env.SHOPSAVVY_NO_WEARABLE_MODEL = "1";
  const started = Date.now();
  const out = [];
  for (const category of categories) {
    out.push(...groupListingsByProduct(listings.filter((l) => l.productCategory === category), { matchStrategy: mlMatchStrategy }));
  }
  return { groups: out, seconds: Math.round((Date.now() - started) / 1000) };
}

const before = group(false);
const after = group(true);
const groupOf = new Map();
before.groups.forEach((g, i) => g.offers.forEach((o) => groupOf.set(String(o._id), i)));
const multiStore = (gs) => gs.filter((g) => new Set(g.offers.map((o) => o.platform)).size > 1).length;

console.log(`${listings.length} listings (${categories.join(", ")})`);
console.log(`without the rule: ${before.groups.length} groups, ${multiStore(before.groups)} compared at 2+ stores (${before.seconds} s)`);
console.log(`with the rule:    ${after.groups.length} groups, ${multiStore(after.groups)} compared at 2+ stores (${after.seconds} s)`);

const joins = after.groups
  .map((g) => ({ g, from: [...new Set(g.offers.map((o) => groupOf.get(String(o._id))))] }))
  .filter(({ from }) => from.length > 1);
console.log(`\n${joins.length} groups now hold offers that were in ${joins.reduce((n, j) => n + j.from.length, 0)} separate groups:\n`);
for (const { g, from } of showAll ? joins : joins.slice(0, 60)) {
  console.log(`* ${g.productName}  (${g.offers.length} offers, PKR ${g.lowestPrice}–${g.highestPrice})`);
  for (const i of from) {
    const b = before.groups[i];
    const stores = [...new Set(b.offers.map((o) => o.platform))].join(", ");
    console.log(`    was: ${b.productName} | ${stores} | PKR ${b.lowestPrice}–${b.highestPrice}`);
  }
}
// Groups the rule took apart (a listing left a group), which it should not do.
const afterOf = new Map();
after.groups.forEach((g, i) => g.offers.forEach((o) => afterOf.set(String(o._id), i)));
const split = before.groups.filter((g) => new Set(g.offers.map((o) => afterOf.get(String(o._id)))).size > 1);
console.log(`\n${split.length} earlier groups were split by the change.`);
for (const g of split.slice(0, 20)) console.log(`  split: ${g.productName} (${g.offers.length} offers)`);
