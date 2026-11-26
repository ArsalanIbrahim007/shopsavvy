// 20-audit-code-splits.js — products shown apart that share a model code (2026-11-26). A shopper found Dawlance's DW-550-AF
// air-fryer microwave as two products and Super Asia's SD-550 spinner as three; this finds every such case. Groups each category
// the way the category pages and product pages do (all its listings, the live strategy), then lists every two products of the
// same brand that share a model code however it is written (a code like "u8000f", an appliance code "80-1217", or a letters-and-
// number code "dw550", suffixes agreeing or one left out) and are priced within GAP of each other. Read-only.
//
//   node src/scripts/ml/20-audit-code-splits.js [--category refrigerator] [--off] [--out file.json]
//   --off: with the new letters-and-number code rule switched off (SHOPSAVVY_NO_PREFIXED_CODE), to compare.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy, sameBrand } from "../../services/similarityModel.service.js";
import { applianceCodeKeys, prefixedModelCodes } from "../../services/similarity.service.js";
import { extractModelCodes } from "../../services/normalizeTitle.service.js";
import { extractBrand } from "../../services/productAttributes.service.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (process.argv.includes("--off")) process.env.SHOPSAVVY_NO_PREFIXED_CODE = "1";
const GAP = 0.35;
const CATEGORIES = arg("--category") ? [arg("--category")] : ["air_conditioner", "refrigerator", "washing_machine", "tv", "appliance", "monitor", "other", "printer", "gaming_console", "camera"];

await mongoose.connect(process.env.MONGO_URI);
const listings = await mongoose.connection.db.collection("listings").find(
  { productCategory: { $in: CATEGORIES }, inStock: { $ne: false }, ...(arg("--title") ? { title: { $regex: arg("--title"), $options: "i" } } : {}) },
  { projection: { title: 1, normalizedTitle: 1, price: 1, platform: 1, productCategory: 1, inStock: 1, ptaStatus: 1, condition: 1, brand: 1 } },
).toArray();
await mongoose.disconnect();

// Every way a title names its model, as comparable keys: "code:u8000f", "appliance:80-1217", "prefixed:dw550/af".
const NOT_A_MODEL = /^(\d+(\.\d+)?[a-z]{1,6}|ddr\d|wifi\d|usb\d|hdr\d+|ue\d+|house\d+|win\d+|\d{2}t\d|ispk\d+|sns\d+)$/;
function modelKeys(title) {
  const keys = new Map();
  for (const code of extractModelCodes(title, { minCodeLength: 4 })) {
    if (/[a-z]/.test(code) && /\d/.test(code) && !NOT_A_MODEL.test(code) && extractBrand(code) === null) keys.set(`code:${code}`, null);
  }
  for (const key of applianceCodeKeys(title)) keys.set(`appliance:${key}`, null);
  for (const [base, suffix] of prefixedModelCodes(title)) keys.set(`prefixed:${base}`, suffix);
  return keys;
}
// "strong": the same code and suffix (or neither has one): the same product written two ways. "weak": one side leaves the suffix
// out ("HRF-538" against "HRF-538 IFPA"), which may be another version of the model.
const sharedKey = (a, b) => {
  let weak = null;
  for (const [key, suffixA] of a) {
    if (!b.has(key)) continue;
    const suffixB = b.get(key);
    if (suffixA === suffixB) return { code: key.replace(/^\w+:/, ""), strength: "strong" };
    if (suffixA === null || suffixB === null) weak ??= { code: key.replace(/^\w+:/, ""), strength: "weak" };
  }
  return weak;
};

const started = Date.now();
const report = [];
let groupsTotal = 0;
for (const category of CATEGORIES) {
  const own = listings.filter((l) => l.productCategory === category);
  if (!own.length) continue;
  const groups = groupListingsByProduct(own, { matchStrategy: mlMatchStrategy });
  groupsTotal += groups.length;
  const info = groups.map((g) => {
    const keys = new Map();
    for (const o of g.offers) for (const [k, s] of modelKeys(o.title || "")) if (!keys.has(k) || (s && !keys.get(k))) keys.set(k, s);
    return { g, keys, middle: (g.lowestPrice + g.highestPrice) / 2, stores: new Set(g.offers.map((o) => o.platform)) };
  });
  const byKey = new Map();
  info.forEach((x, i) => { for (const k of x.keys.keys()) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
  const seen = new Set();
  for (const ids of byKey.values()) {
    for (let p = 0; p < ids.length; p++) for (let q = p + 1; q < ids.length; q++) {
      const [i, j] = [ids[p], ids[q]];
      const pair = `${i}|${j}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const [a, b] = [info[i], info[j]];
      if (!sameBrand(a.g.rawGroupKey, b.g.rawGroupKey)) continue;
      if (a.g.storage && b.g.storage && a.g.storage !== b.g.storage) continue;
      if (Math.abs(a.middle - b.middle) / Math.max(a.middle, b.middle) > GAP) continue;
      const shared = sharedKey(a.keys, b.keys);
      if (!shared) continue;
      report.push({
        category, code: shared.code, strength: shared.strength,
        a: { name: a.g.productName, offers: a.g.offers.length, stores: [...a.stores], price: [a.g.lowestPrice, a.g.highestPrice] },
        b: { name: b.g.productName, offers: b.g.offers.length, stores: [...b.stores], price: [b.g.lowestPrice, b.g.highestPrice] },
      });
    }
  }
}
// One line per code: how many products it is spread over (strong pairs only, then weak).
const summarise = (strength) => {
  const byCode = new Map();
  for (const r of report.filter((x) => x.strength === strength)) {
    const k = `${r.category}|${r.code}`;
    if (!byCode.has(k)) byCode.set(k, new Map());
    for (const side of [r.a, r.b]) byCode.get(k).set(side.name, side);
  }
  return [...byCode].map(([k, m]) => ({ key: k, strength, products: [...m.values()] })).sort((x, y) => y.products.length - x.products.length);
};
const strong = summarise("strong");
const weak = summarise("weak");
const codes = [...strong, ...weak];
const extra = (list) => list.reduce((n, c) => n + c.products.length - 1, 0);
console.log(`${listings.length} listings, ${groupsTotal} products in ${CATEGORIES.length} categories (${Math.round((Date.now() - started) / 1000)} s)${process.env.SHOPSAVVY_NO_PREFIXED_CODE ? " [new code rule OFF]" : ""}`);
console.log(`STRONG (same code and suffix): ${strong.length} codes shown as 2+ products, ${extra(strong)} products too many`);
console.log(`WEAK (one side leaves the suffix out, may be another version): ${weak.length} codes, ${extra(weak)} products\n`);
for (const c of strong.slice(0, Number(arg("--top") ?? 40))) {
  const [category, code] = c.key.split("|");
  console.log(`* ${code} (${category}): ${c.products.length} products`);
  for (const p of c.products) console.log(`    [${p.offers}, ${p.stores.length} stores] ${p.name.slice(0, 95)}  PKR ${p.price[0]}-${p.price[1]}`);
}
if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify({ at: new Date().toISOString(), off: Boolean(process.env.SHOPSAVVY_NO_PREFIXED_CODE), pairs: report, codes }, null, 1));
