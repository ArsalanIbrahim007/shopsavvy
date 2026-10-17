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
    const counts = new Map(); // value -> count, in order of first appearance (the preferred offer first)
    for (const offer of read) {
      const value = offer.specSheet[field];
      if (value === undefined || value === null) continue;
      const key = JSON.stringify(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = null;
    for (const [key, count] of counts) if (best === null || count > best.count) best = { key, count };
    if (best) specs[field] = JSON.parse(best.key);
  }
  return { specs: sanitizeSpecSheet(specs), from: [...new Set(read.map((o) => o.platform))] };
}
