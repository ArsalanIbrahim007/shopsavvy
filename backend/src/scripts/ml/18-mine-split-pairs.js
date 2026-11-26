// 18-mine-split-pairs.js — pairs of products the site shows APART that may be one product, for a person to label (2026-11-26).
//
// The shopper's complaint was the opposite of a wrong merge: the same earbuds as two or five products ("Audionic Airbud 550" and
// "Airbud 550 Slide Earbuds"). This groups a category the way the site does (the trained matcher over every visible listing), then
// pairs up the resulting products that name the same maker (or one names none, as a maker's own store does), share a model number,
// and are priced within PRICE_GAP of each other, most alike first. A person marks each pair Y (same product, colour may differ) or
// N (different model, variant or condition). The labels are used to check and fix the grouping rules; the trained classifier and
// its reported scores are not changed by them.
//
//   node src/scripts/ml/18-mine-split-pairs.js headphones        writes <repo>/../labelling/split-pairs-headphones.csv
//   node src/scripts/ml/18-mine-split-pairs.js headphones 200    at most 200 pairs (default 150)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { groupListings } from "../../services/grouping.service.js";
import { extractBrand } from "../../services/productAttributes.service.js";

const category = process.argv[2] ?? "headphones";
const LIMIT = Number(process.argv[3] ?? 150);
const PRICE_GAP = 0.35;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "labelling");

const STOP = new Set(["with", "and", "the", "for", "wireless", "bluetooth", "earbuds", "earbud", "earphones", "earphone", "headphones", "headphone", "headset", "true", "tws", "pta", "new", "official", "warranty", "black", "white", "blue", "red", "green", "pink", "grey", "gray", "silver", "gold", "ispk", "noise", "cancelling", "canceling"]);
const words = (title) => new Set((String(title).toLowerCase().match(/[a-z0-9]+/g) ?? []).map((w) => w.replace(/^([a-z]{4,})s$/, "$1")).filter((w) => w.length >= 2 && !STOP.has(w) && !/^ispk\d*$/.test(w)));
const numbers = (set) => [...set].filter((w) => /\d{2,}/.test(w));
const jaccard = (a, b) => [...a].filter((w) => b.has(w)).length / new Set([...a, ...b]).size;
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

await mongoose.connect(process.env.MONGO_URI);
const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, productCategory: category }).lean();
console.log(`${listings.length} ${category} listings; grouping them as the site does (about a minute)...`);
const groups = await groupListings(listings, { recommend: false, threshold: 1e9 });
await mongoose.disconnect();

const products = groups.map((g) => {
  const prices = g.offers.map((o) => o.price).filter((p) => p > 0);
  const titles = [...new Set(g.offers.map((o) => o.title))];
  const set = words(g.productName);
  for (const t of titles.slice(0, 5)) for (const w of words(t)) set.add(w);
  return {
    name: g.productName,
    brand: extractBrand(g.productName) ?? g.offers.map((o) => extractBrand(o.title)).find(Boolean) ?? null,
    stores: [...new Set(g.offers.map((o) => o.platform))].join(", "),
    offers: g.offers.length,
    low: Math.min(...prices),
    cheapest: [...g.offers].filter((o) => o.price > 0).sort((x, y) => x.price - y.price)[0],
    titles,
    words: set,
    numbers: numbers(set),
  };
}).filter((p) => Number.isFinite(p.low) && p.numbers.length);

const byNumber = new Map();
products.forEach((p, i) => p.numbers.forEach((n) => byNumber.set(n, [...(byNumber.get(n) ?? []), i])));
const seen = new Set();
const pairs = [];
for (const members of byNumber.values()) {
  if (members.length > 60) continue; // a number shared by everything ("2024", "5.3") says nothing
  for (const i of members) for (const j of members) {
    if (j <= i || seen.has(`${i}|${j}`)) continue;
    seen.add(`${i}|${j}`);
    const a = products[i];
    const b = products[j];
    if (a.brand && b.brand && a.brand !== b.brand) continue;
    if (Math.abs(a.low - b.low) / Math.max(a.low, b.low) > PRICE_GAP) continue;
    const score = jaccard(a.words, b.words);
    if (score >= 0.3) pairs.push({ a, b, score });
  }
}
pairs.sort((x, y) => y.score - x.score);
// One row per pair of names once a seller's wording is taken out: AlfaMall's "... 100% Original Box Pack Stock_On Installment By
// Tech House90016" and "... By Tech House015" are one product listed by many sellers, and filled the sheet with the same Ronin pair.
const plain = (name) => String(name).toLowerCase()
  .replace(/\s*(stock[_ ]on installments?|at 0% markup|\bby\s+(tech house|future cell|microtel|optus)).*$/, "")
  .replace(/\b(100%|10)\s+original\b|\boriginal\b|\bbox pack(ed)?\b|\bbrand new\b/g, " ")
  .replace(/\s+/g, " ").trim();
const rowKey = new Set();
const chosen = [];
let sameOnceCleaned = 0;
for (const pair of pairs) {
  const [x, y] = [plain(pair.a.name), plain(pair.b.name)].sort();
  if (x === y) { sameOnceCleaned += 1; continue; } // the same name but for the seller's wording: no label needed
  if (rowKey.has(`${x}|${y}`)) continue;
  rowKey.add(`${x}|${y}`);
  chosen.push(pair);
  if (chosen.length >= LIMIT) break;
}
console.log(`${sameOnceCleaned} pairs differ only by a seller's wording (left out: those are one product)`);

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `split-pairs-${category}.csv`);
const header = ["id", "same_product (Y/N)", "note", "product_A", "stores_A", "from_A", "product_B", "stores_B", "from_B", "other_titles_A", "other_titles_B", "similarity"];
const rows = chosen.map((p, k) => [
  k + 1, "", "", p.a.name, p.a.stores, p.a.low, p.b.name, p.b.stores, p.b.low,
  p.a.titles.filter((t) => t !== p.a.name).slice(0, 3).join(" | "), p.b.titles.filter((t) => t !== p.b.name).slice(0, 3).join(" | "), p.score.toFixed(2),
].map(csv).join(","));
writeFileSync(file, "﻿" + [header.map(csv).join(","), ...rows].join("\r\n") + "\r\n");

// The same pairs as a sheet for labelling/label.html (the page used for the earlier rounds: S same, D different, U unsure).
const sheetHeader = ["pair_id", "category", "store_A", "title_A", "price_A", "link_A", "store_B", "title_B", "price_B", "link_B", "label (same / different / unsure)", "note"];
const side = (p) => [`${p.stores}${p.offers > 1 ? ` (${p.offers} offers)` : ""}`, p.name, p.cheapest?.price ?? p.low, p.cheapest?.productUrl || p.cheapest?.sourceUrl || ""];
const sheetRows = chosen.map((p, k) => [`S${String(k + 1).padStart(3, "0")}`, category, ...side(p.a), ...side(p.b), "", ""].map(csv).join(","));
const sheetFile = join(OUT_DIR, `sheet-${category}-splits.csv`);
writeFileSync(sheetFile, "﻿" + [sheetHeader.map(csv).join(","), ...sheetRows].join("\r\n") + "\r\n");
console.log(`and for label.html: ${sheetFile}`);
console.log(`${groups.length} products; ${pairs.length} candidate pairs; wrote ${chosen.length} to ${file}`);
