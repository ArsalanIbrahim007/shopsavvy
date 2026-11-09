// specs.js — the specification rows for a product, built from what the listing states. Most stores
// publish specifications only inside the title, so these are "derived from the title" and the page says so.
// A row is left out when the value is missing, so nothing is ever shown as "unknown".

import { categoryName } from "./categories.js";
import { formatBrand, formatCapacity, formatCondition, formatPta, formatScreen } from "./format.js";

/** @returns {Array<[string, string]>} label / value pairs, in display order */
export function buildSpecs(listing) {
  if (!listing) return [];
  const rows = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== "") rows.push([label, String(value)]);
  };

  add("Brand", formatBrand(listing.brand));
  if (listing.productCategory && listing.productCategory !== "other") add("Category", categoryName(listing.productCategory));
  if (listing.storageGb) add("Storage", formatCapacity(listing.storageGb));
  if (listing.ramGb) add("Memory", `${listing.ramGb} GB RAM`);
  if (listing.screenInches) add("Screen size", formatScreen(listing.screenInches));
  add("Resolution", listing.resolution);
  add("Colour", listing.colour);
  add("Condition", listing.condition ? formatCondition(listing.condition) : "");
  // "unknown" is the absence of a statement, not a property of the product.
  if (listing.ptaStatus && listing.ptaStatus !== "unknown") add("PTA status", formatPta(listing.ptaStatus));
  return rows;
}

// The specifications stores' own pages state (backend Specs engine: the canonical sheet), in display order. `better` says which
// value wins a row on the Compare page: "high" (more RAM), "low" (less weight), or an order of named values; none for text.
const TIERS = ["entry", "mid", "upper-mid", "flagship"];
const PANELS = ["LCD", "IPS", "OLED", "AMOLED"];
const yesNo = (v) => (v ? "Yes" : "No");
const grouped = (n) => Number(n).toLocaleString("en-US");
export const SPEC_FIELDS = [
  { field: "chipset", label: "Chipset" },
  { field: "chipsetTier", label: "Chipset class", format: (v) => ({ entry: "Entry", mid: "Mid-range", "upper-mid": "Upper mid-range", flagship: "Flagship" })[v] ?? v, better: TIERS },
  { field: "ramGb", label: "RAM", format: (v) => `${v} GB`, better: "high" },
  { field: "storageGb", label: "Storage", format: (v) => formatCapacity(v), better: "high" },
  { field: "displayInches", label: "Screen", format: (v) => `${v}″` },
  { field: "displayType", label: "Panel", better: PANELS },
  { field: "refreshHz", label: "Refresh rate", format: (v) => `${v} Hz`, better: "high" },
  { field: "batteryMah", label: "Battery", format: (v) => `${grouped(v)} mAh`, better: "high" },
  { field: "chargingW", label: "Charging", format: (v) => `${v} W`, better: "high" },
  { field: "mainCameraMp", label: "Main camera", format: (v) => `${v} MP`, better: "high" },
  { field: "frontCameraMp", label: "Front camera", format: (v) => `${v} MP`, better: "high" },
  { field: "has5g", label: "5G", format: yesNo, better: [false, true] },
  { field: "nfc", label: "NFC", format: yesNo, better: [false, true] },
  { field: "weightG", label: "Weight", format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kg` : `${v} g`), better: "low" },
  { field: "os", label: "Software" },
];

/** A sheet's value as shown, or null when the sheet does not state it. */
export function formatSpec(field, value) {
  if (value === undefined || value === null || value === "") return null;
  const spec = SPEC_FIELDS.find((s) => s.field === field);
  return spec?.format ? spec.format(value) : String(value);
}

/** The label/value rows of a page-specification sheet, in display order. */
export function buildPageSpecs(sheet) {
  if (!sheet) return [];
  return SPEC_FIELDS.map(({ field, label }) => [label, formatSpec(field, sheet[field])]).filter(([, value]) => value !== null);
}

/**
 * Which columns hold the best value of a row ([] when it has no "better", when fewer than two columns state it, or when they all
 * state the same). Ties are all best.
 * @param {string} field
 * @param {Array<*>} values  one per product, undefined/null where unknown
 * @returns {number[]}
 */
export function bestOf(field, values) {
  const better = SPEC_FIELDS.find((s) => s.field === field)?.better;
  if (!better) return [];
  const rankOf = (v) => {
    if (v === undefined || v === null) return null;
    if (better === "high") return Number(v);
    if (better === "low") return -Number(v);
    const i = better.indexOf(v);
    return i >= 0 ? i : null;
  };
  const ranks = values.map(rankOf);
  const known = ranks.filter((r) => r !== null && Number.isFinite(r));
  if (known.length < 2 || new Set(known).size === 1) return [];
  const top = Math.max(...known);
  return ranks.flatMap((r, i) => (r === top ? [i] : []));
}
