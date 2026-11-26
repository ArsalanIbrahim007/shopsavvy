// 21-audit-mixed-codes.js — the other side of 20-audit-code-splits.js: products that hold two different models of one maker
// (2026-11-26). Groups a category as the category pages do and lists every product whose offers name different codes with the same
// letters ("WF-7381" and "WF-9491", "HWM 80-CS" and "HWM-80-60"): a wrong merge, or a title naming two models. Read-only.
//
//   node src/scripts/ml/21-audit-mixed-codes.js --category appliance [--title regex] [--off]
import "dotenv/config";
import mongoose from "mongoose";
import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";
import { prefixedModelCodes, codeTailConflict } from "../../services/similarity.service.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (process.argv.includes("--off")) process.env.SHOPSAVVY_NO_PREFIXED_CODE = "1";
const category = arg("--category") ?? "appliance";
await mongoose.connect(process.env.MONGO_URI);
const listings = await mongoose.connection.db.collection("listings").find(
  { productCategory: category, inStock: { $ne: false }, ...(arg("--title") ? { title: { $regex: arg("--title"), $options: "i" } } : {}) },
  { projection: { title: 1, price: 1, platform: 1, productCategory: 1, inStock: 1, ptaStatus: 1, condition: 1 } },
).toArray();
await mongoose.disconnect();

const groups = groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const mixed = [];
for (const g of groups) {
  // the codes of each offer, by their letters: two different numbers (or tails) under one maker's letters are two models
  const byLetters = new Map();
  for (const o of g.offers) {
    for (const base of prefixedModelCodes(o.title).keys()) {
      const letters = base.replace(/\d+$/, "");
      if (!byLetters.has(letters)) byLetters.set(letters, new Map());
      byLetters.get(letters).set(base, o.title);
    }
  }
  const different = [...byLetters.values()].filter((m) => m.size > 1);
  const tails = g.offers.some((a, i) => g.offers.slice(i + 1).some((b) => codeTailConflict(a.title, b.title)));
  if (different.length || tails) mixed.push({ g, examples: different.flatMap((m) => [...m.entries()]).slice(0, 4), tails });
}
console.log(`${category}${arg("--title") ? ` /${arg("--title")}/` : ""}: ${listings.length} listings, ${groups.length} products, ${mixed.length} hold two models of one maker${process.env.SHOPSAVVY_NO_PREFIXED_CODE ? " [new code rule OFF]" : ""}`);
for (const { g, examples, tails } of mixed.slice(0, Number(arg("--top") ?? 15))) {
  console.log(`* [${g.offers.length}] ${g.productName.slice(0, 90)}${tails ? "  (codes go on differently)" : ""}`);
  for (const [base, title] of examples) console.log(`    ${base}: ${title.slice(0, 90)}`);
}
