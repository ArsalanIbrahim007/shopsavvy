// specsEngine.service.js — the one door between the rest of the backend and Muzammil's Specs engine (backend/src/specs/, task S1/S2).
//
// The engine reads a store's product page into typed specifications and scores them. Its contract (context-muzammil.md, section 5):
//
//   extractSpecs(platform, html) -> raw label/value pairs, or null for a store it has no reader for
//   normalizeSpecs(raw)          -> the canonical sheet: { chipset, chipsetTier, ramGb, storageGb, displayInches, refreshHz,
//                                   displayType, batteryMah, chargingW, mainCameraMp, frontCameraMp, os, has5g, nfc, weightG }
//   specScore(sheet, category)   -> { score: 0..100, parts: [{ field, points, max }] }, or null when too few fields are known
//   rankInBand(product, others)  -> where a product's score stands among products priced like it (the engine owns the price
//                                   bands); product is { id, category, score, price }, others are { id, score, price } of the
//                                   same category; returns { rank, of, band: { min, max } } or null (no band, empty band)
//
// It is loaded when present. Until it is merged every function here answers null, so the page check and the compare endpoint
// work today and gain specifications the day it lands, with no change here. Whatever the engine returns is checked before it is
// stored or shown (sanitizeSpecSheet): a field outside the contract, a wrong type or an impossible value is dropped, so a parser
// slip can never put a 300-inch phone in the database, and an engine that throws never stops the page check.

import { existsSync } from "node:fs";

import { FILLER_WORDS } from "../ml/fillerWords.js";
import Listing from "../models/listing.model.js";
import { modelTokens } from "./normalizeTitle.service.js";
import { extractNetworkGeneration } from "./productAttributes.service.js";
import { tokenize } from "./similarity.service.js";
import { withoutStoreWording } from "./similarityModel.service.js";

/** The canonical fields, each with the check its value must pass. */
const NUMBER = (min, max) => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const TEXT = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 80;
const ONE_OF = (...values) => (v) => values.includes(v);
const FLAG = (v) => typeof v === "boolean";

export const SPEC_FIELDS = Object.freeze({
  chipset: TEXT,
  chipsetTier: ONE_OF("flagship", "upper-mid", "mid", "entry"),
  ramGb: NUMBER(0.5, 256),
  storageGb: NUMBER(1, 16384),
  displayInches: NUMBER(1, 20),
  refreshHz: NUMBER(24, 540),
  displayType: ONE_OF("AMOLED", "LCD", "OLED", "IPS"),
  batteryMah: NUMBER(100, 40000),
  chargingW: NUMBER(1, 300),
  mainCameraMp: NUMBER(0.3, 300),
  frontCameraMp: NUMBER(0.3, 200),
  os: TEXT,
  has5g: FLAG,
  nfc: FLAG,
  weightG: NUMBER(10, 5000),
});

/** Categories whose pages are read for specifications (the engine starts with phones, then laptops and tablets). */
export const SPEC_CATEGORIES = Object.freeze(["smartphone", "tablet", "laptop"]);

/** Only the canonical fields, each of the right type and range; null when nothing is left. */
export function sanitizeSpecSheet(sheet) {
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) return null;
  const clean = {};
  for (const [field, valid] of Object.entries(SPEC_FIELDS)) {
    const value = typeof sheet[field] === "string" ? sheet[field].trim() : sheet[field];
    if (valid(value)) clean[field] = value;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

let engine; // undefined: not looked for yet; null: not there

const ENGINE_URL = new URL("../specs/index.js", import.meta.url);

/**
 * The engine module, or null while it is not merged. Only an absent file is silent: an engine that is present but fails to load
 * (one of its own imports missing, a syntax error) is reported once and then treated as missing, so a broken merge shows up in
 * the log rather than as specifications quietly never appearing.
 * @param {{importer?: () => Promise<object>, exists?: () => boolean}} [options]  replace the file check and the import in tests
 */
export async function loadSpecsEngine({ importer = () => import(ENGINE_URL.href), exists = () => existsSync(ENGINE_URL) } = {}) {
  if (engine !== undefined) return engine;
  if (!exists()) {
    engine = null;
    return engine;
  }
  try {
    const module = await importer();
    engine = typeof module?.extractSpecs === "function" && typeof module?.normalizeSpecs === "function" ? module : null;
    if (!engine) console.warn("[specs] backend/src/specs/index.js does not export extractSpecs and normalizeSpecs; specifications are off");
  } catch (error) {
    console.warn(`[specs] the Specs engine could not be loaded: ${error.message}`);
    engine = null;
  }
  return engine;
}

/** Forgets the loaded engine (tests). */
export function resetSpecsEngine() {
  engine = undefined;
}

/** The canonical, checked sheet a store page gives, or null (no engine, no reader for that store, nothing found, or an error). */
export async function readSpecSheet(platform, html, { log = () => {} } = {}) {
  const loaded = await loadSpecsEngine();
  if (!loaded) return null;
  try {
    const raw = loaded.extractSpecs(String(platform).toLowerCase(), html);
    return raw ? sanitizeSpecSheet(loaded.normalizeSpecs(raw)) : null;
  } catch (error) {
    log(`[specs] ${platform}: ${error.message}`);
    return null;
  }
}

/** The engine's score for a sheet, checked; null without an engine, a sheet, or enough fields. */
export async function scoreSpecSheet(sheet, category) {
  const loaded = await loadSpecsEngine();
  if (!loaded || typeof loaded.specScore !== "function" || !sheet) return null;
  try {
    const result = loaded.specScore(sheet, category);
    if (!result || !NUMBER(0, 100)(result.score)) return null;
    const parts = Array.isArray(result.parts)
      ? result.parts.filter((p) => p && typeof p.field === "string" && Number.isFinite(p.points) && Number.isFinite(p.max))
      : [];
    return { score: result.score, parts };
  } catch {
    return null;
  }
}

/** The engine's rank of `product` ({ id, category, score, price }) among `others` ({ id, score, price } each), or null. */
export async function rankSpecScore(product, others) {
  const loaded = await loadSpecsEngine();
  if (!loaded || typeof loaded.rankInBand !== "function" || !product || product.score == null) return null;
  try {
    return loaded.rankInBand(product, others) ?? null;
  } catch {
    return null;
  }
}

/**
 * A sheet with the RAM and storage the listing's own title states (productAttributes: `ramGb`, `storageGb`), which name the variant
 * being sold; a store's page often lists every variant ("4/6 GB") or none, so the title's capacity wins where it states one.
 * @returns {object|null}
 */
export function withStatedCapacity(specs, listing) {
  const stated = {};
  if (Number(listing?.ramGb) > 0) stated.ramGb = Number(listing.ramGb);
  if (Number(listing?.storageGb) > 0) stated.storageGb = Number(listing.storageGb);
  return sanitizeSpecSheet({ ...(specs ?? {}), ...stated });
}

/**
 * One sheet for a product from its offers' sheets (each store's page is read separately and they can disagree). For each field,
 * the value most offers give; a tie goes to `preferId`'s offer, then to the page read most recently. `from` lists the stores whose
 * pages contributed.
 * @param {object[]} offers  each may carry `specSheet` and `pageCheckedAt`
 * @param {{preferId?: string}} [options]
 * @returns {{specs: object|null, from: string[]}}
 */
export function mergeSpecSheets(offers, { preferId } = {}) {
  const read = offers
    .filter((o) => o.specSheet && typeof o.specSheet === "object")
    .sort((a, b) => (String(b._id) === preferId) - (String(a._id) === preferId) || new Date(b.pageCheckedAt || 0) - new Date(a.pageCheckedAt || 0));
  if (read.length === 0) return { specs: null, from: [] };

  const specs = {};
  for (const field of Object.keys(SPEC_FIELDS)) {
    // One vote per store: a marketplace lists one phone through several sellers, each with the same page text ("Dimensity 7200 Pro
    // / Dimensity 7300" twice at DigiMall outvoted PriceOye's "Dimensity 7300 Pro", 2026-11-09).
    const counts = new Map(); // value -> stores, in order of first appearance (the preferred offer first)
    const voted = new Set();
    for (const offer of read) {
      const value = offer.specSheet[field];
      if (value === undefined || value === null) continue;
      if (voted.has(offer.platform)) continue;
      voted.add(offer.platform);
      const key = JSON.stringify(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = null;
    for (const [key, count] of counts) if (best === null || count > best.count) best = { key, count };
    if (best) specs[field] = JSON.parse(best.key);
  }
  return { specs: sanitizeSpecSheet(specs), from: [...new Set(read.map((o) => o.platform))] };
}

// ---------------------------------------------------------------- one model, every variant
//
// Specifications belong to a model, not to one variant of it: a 256 GB and a 512 GB iPhone 17 Pro have the same chip, screen,
// battery and cameras. A product's offers were its only source, so a variant whose own stores' pages state little showed dashes while
// another variant's page said everything (2026-11-10: three of four iPhones compared were nearly blank). A product's sheet is now
// completed from the sheets of the same model's other listings; its RAM and storage stay its own (withStatedCapacity).

// Colour and finish words not in FILLER_WORDS that stores add to a phone's title ("Cosmic Orange", "Desert Titanium").
const FINISH_WORDS = new Set(["cosmic", "deep", "desert", "natural", "aurora", "ocean", "sandy", "forest", "lunar", "shadow", "mist", "frost", "glacier", "ice", "jade", "coral", "rose", "sunset", "dusk", "dawn", "awesome", "lilac", "feather", "cappuccino", "brown", "beige", "teal", "light", "dark", "matte", "glossy", "color", "colour"]);
const MODEL_FIELDS_ONLY = Object.keys(SPEC_FIELDS).filter((field) => field !== "ramGb" && field !== "storageGb");

/**
 * The model a title names, as a key: its words without capacities, colours, PTA and store wording, with its network generation
 * ("samsung galaxy a17 5g" is another phone than "samsung galaxy a17"). Two variants of one model share it; a Pro and a Pro Max do not.
 * Null when too little is left to tell models apart.
 */
export function modelKeyOf(title, category = "") {
  const text = withoutStoreWording(String(title ?? "")).replace(/\b\d{1,2}\s*\/\s*\d{2,4}\s*(gb)?\b/gi, " ");
  const words = tokenize(modelTokens(text)).filter((word) => !FILLER_WORDS.has(word) && !FINISH_WORDS.has(word) && word !== "gb" && word !== "tb");
  if (words.length < 2) return null;
  const generation = extractNetworkGeneration(title); // 5 for "5G", 4 for "4G", null when the title does not say
  return `${category}:${[...new Set(words)].sort().join(" ")}${generation === 5 && !words.includes("5g") ? " 5g" : ""}`;
}

const MODEL_INDEX_MS = 10 * 60 * 1000;
let modelIndex = null; // { at, byKey: Map<key, offer[]> }

/** Every stored sheet by its listing's model key, read at most every ten minutes (about 1,500 sheets). */
async function sheetsByModel({ model = Listing, now = Date.now() } = {}) {
  if (modelIndex && now - modelIndex.at < MODEL_INDEX_MS) return modelIndex.byKey;
  const rows = await model.find({ specSheet: { $ne: null }, isActive: true }, { title: 1, platform: 1, productCategory: 1, specSheet: 1, pageCheckedAt: 1 }).lean();
  const byKey = new Map();
  for (const row of rows) {
    const key = modelKeyOf(row.title, row.productCategory);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  modelIndex = { at: now, byKey };
  return byKey;
}

/** Forgets the index (tests, and after a page check). */
export function clearModelIndex() {
  modelIndex = null;
}

/**
 * `specs` (a product's merged sheet, or null) completed with what the same model's other listings' sheets state, for the fields it
 * lacks; RAM and storage are never taken from another variant. `from` gains the stores that added something.
 * @returns {Promise<{specs: object|null, from: string[]}>}
 */
export async function withModelSpecs(specs, from, listing, options = {}) {
  const key = modelKeyOf(listing?.title, listing?.productCategory);
  if (!key) return { specs, from };
  let byKey;
  try {
    byKey = await sheetsByModel(options);
  } catch {
    return { specs, from }; // without the index the product keeps its own sheet
  }
  const others = byKey.get(key);
  if (!others?.length) return { specs, from };
  const shared = mergeSpecSheets(others).specs ?? {};
  const filled = { ...(specs ?? {}) };
  const added = new Set();
  for (const field of MODEL_FIELDS_ONLY) {
    if (filled[field] === undefined && shared[field] !== undefined) {
      filled[field] = shared[field];
      for (const o of others) if (o.specSheet?.[field] !== undefined) added.add(o.platform);
    }
  }
  return { specs: sanitizeSpecSheet(filled), from: [...new Set([...(from ?? []), ...added])] };
}
