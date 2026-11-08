// features.js — what the fair-price model (a linear regression on the log of the price) reads from a listing.
//
// Pakistani store titles carry almost everything that sets a price ("Samsung Galaxy S25 Ultra 12GB 256GB PTA Approved",
// "Gree 1.5 Ton Inverter Pulse Series"), while the structured fields are sparse (brand is filled for under 5% of listings), so:
//   - the title's words, and pairs of neighbouring words among its first five ("galaxy s25", "s25 ultra", "1.5 ton"), one-hot;
//   - numbers where the title states them: log2 storage and RAM, screen inches, tonnage, drum kg, volume litres, inverter;
//   - the store (stores price differently), the condition and the PTA status, one-hot.
// A model per category learns its own vocabulary (scripts/ml/fairPrice/01-train-evaluate.js).

import { FILLER_WORDS } from "../fillerWords.js";
import { normalizeTitle } from "../../services/normalizeTitle.service.js";
import {
  extractCapacityKg,
  extractInverter,
  extractRamGb,
  extractScreenInches,
  extractStorageGb,
  extractTonnage,
  extractVolumeLitres,
} from "../../services/productAttributes.service.js";

export const NUMERIC_FEATURES = ["logStorage", "logRam", "screen", "tonnage", "kg", "litres", "inverter"];
const PAIR_WINDOW = 5;

/** The title's words (and neighbouring pairs among the first PAIR_WINDOW), as feature names. */
export function titleTokens(title) {
  const words = normalizeTitle(title ?? "").split(/\s+/).filter((w) => w && !FILLER_WORDS.has(w) && /[a-z0-9]/.test(w));
  const tokens = new Set(words.map((w) => `w:${w}`));
  const head = words.slice(0, PAIR_WINDOW);
  for (let i = 0; i + 1 < head.length; i++) tokens.add(`p:${head[i]}_${head[i + 1]}`);
  return [...tokens];
}

const log2 = (v) => (Number(v) > 0 ? Math.log2(Number(v)) : null);

/** The numbers the title (or the listing's fields) states, null where it says nothing. */
export function numericValues(listing) {
  const title = listing.title ?? "";
  const storage = listing.storageGb ?? extractStorageGb(title);
  const ram = listing.ramGb ?? extractRamGb(title);
  const inverter = extractInverter(title); // "inverter", "non_inverter" or null
  const kg = extractCapacityKg(title); // every drum size the title names (a washer-dryer names two): the largest
  return {
    logStorage: log2(storage),
    logRam: log2(ram),
    screen: listing.screenInches ?? extractScreenInches(title) ?? null,
    tonnage: extractTonnage(title) ?? null,
    kg: Array.isArray(kg) && kg.length ? Math.max(...kg) : Number(kg) > 0 ? Number(kg) : null,
    litres: extractVolumeLitres(title) ?? null,
    inverter: inverter === "inverter" ? 1 : inverter === "non_inverter" ? 0 : null,
  };
}

/** The one-hot names for the store, condition and PTA status. */
export function categoricalTokens(listing) {
  return [`s:${listing.platform}`, `c:${listing.condition ?? "new"}`, `t:${listing.ptaStatus ?? "unknown"}`];
}

/**
 * The sparse row for a listing under a trained category model: [[index, value], ...]. A number the title does not state is left
 * out (0 after centring, i.e. "typical"); its absence is a feature of its own, so "no storage stated" can carry its own price level.
 */
export function rowFor(listing, model) {
  const row = [];
  for (const token of [...titleTokens(listing.title), ...categoricalTokens(listing)]) {
    const index = model.index[token];
    if (index !== undefined) row.push([index, 1]);
  }
  const values = numericValues(listing);
  NUMERIC_FEATURES.forEach((name) => {
    const stat = model.numeric[name];
    if (!stat) return;
    const v = values[name];
    if (v === null || v === undefined) {
      if (stat.missingIndex !== undefined) row.push([stat.missingIndex, 1]);
    } else {
      row.push([stat.index, (v - stat.mean) / (stat.std || 1)]);
    }
  });
  return row;
}

/** How much of a title the model knows: the share of its words that are in the vocabulary (an unknown model line is a guess). */
export function vocabularyCoverage(listing, model) {
  const words = titleTokens(listing.title).filter((t) => t.startsWith("w:"));
  if (words.length === 0) return 0;
  return words.filter((t) => model.index[t] !== undefined).length / words.length;
}
