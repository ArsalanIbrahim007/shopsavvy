import { detectCategory } from "../scrapers/productCategory.js";

/**
 * Derives structured attributes from a product title.
 *
 * These are extracted once when a listing is collected and stored on the
 * document. Deriving them at query time would re-parse every title on every
 * search, and would leave the database unable to answer questions such as
 * "which storage capacities are available for this product".
 */

const COLOURS = [
  "natural titanium", "desert titanium", "space grey", "space gray",
  "titanium", "graphite", "midnight", "starlight", "ultramarine",
  "lavender", "black", "white", "silver", "gold", "grey", "gray",
  "blue", "green", "red", "pink", "purple", "yellow", "orange",
  "teal", "cream", "beige", "bronze", "copper", "navy", "mint",
];

export function extractStorageGb(title = "") {
  const found = [];

  for (const match of String(title).toLowerCase().matchAll(/\b(\d+)\s*(gb|tb)\b/g)) {
    const value = Number(match[1]);
    found.push(match[2] === "tb" ? value * 1024 : value);
  }

  return found.length ? Math.max(...found) : null;
}

export function extractRamGb(title = "") {
  const text = String(title).toLowerCase();

  const labelled = text.match(/\b(\d+)\s*gb\s*(ram|memory)\b/);
  if (labelled) return Number(labelled[1]);

  const found = [];
  for (const match of text.matchAll(/\b(\d+)\s*(gb|tb)\b/g)) {
    const value = Number(match[1]);
    found.push(match[2] === "tb" ? value * 1024 : value);
  }

  // A single capacity is assumed to be storage, not RAM.
  return found.length >= 2 ? Math.min(...found) : null;
}

export function extractColour(title = "") {
  const text = String(title).toLowerCase();

  // Longer names first, so "space grey" is preferred over "grey".
  const match = COLOURS.find((colour) => text.includes(colour));
  if (!match) return null;

  const tidy = match.replace("gray", "grey");
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/**
 * PTA approval is specific to the Pakistani market. A non-approved handset
 * cannot use local networks without a tax payment, so it is a material
 * difference between two otherwise identical listings.
 */
export function extractPtaStatus(title = "") {
  const text = String(title).toLowerCase();

  if (/\bnon[\s-]?pta\b/.test(text)) return "non_pta";
  if (/\bpta\b/.test(text)) return "pta_approved";
  return "unknown";
}

export function extractCondition(title = "") {
  const text = String(title).toLowerCase();

  if (/\brefurb(ished)?\b/.test(text)) return "refurbished";
  if (/\b(used|pre[\s-]?owned|second hand)\b/.test(text)) return "used";
  if (/\b(open box|openbox)\b/.test(text)) return "open_box";
  return "new";
}

export function extractScreenInches(title = "") {
  const match = String(title).toLowerCase()
    .match(/\b(\d{2}(?:\.\d)?)\s*(?:inch|inches|"|”|″)/);

  if (!match) return null;

  const value = Number(match[1]);
  return value >= 10 && value <= 120 ? value : null;
}
/**
 * Display resolution. Checked from highest to lowest, because "Full HD"
 * contains "HD" and "4K UHD" contains both markers, so an unordered test
 * would classify a 4K panel as HD.
 */
export function extractResolution(title = "") {
  const text = String(title).toLowerCase();

  if (/\b8k\b/.test(text)) return "8K";
  if (/\b4k\b|\buhd\b/.test(text)) return "4K";
  if (/\bqhd\b|\b2k\b|\b1440p\b/.test(text)) return "QHD";
  if (/\bfhd\b|\bfull hd\b|\b1080p\b/.test(text)) return "FHD";
  if (/\bhd\b|\b720p\b/.test(text)) return "HD";

  return null;
}

export function extractAttributes(title = "") {
  const { category } = detectCategory(title);

  return {
    productCategory: category,
    storageGb: extractStorageGb(title),
    ramGb: extractRamGb(title),
    colour: extractColour(title),
    ptaStatus: extractPtaStatus(title),
    condition: extractCondition(title),
    screenInches: extractScreenInches(title),
    resolution: extractResolution(title),
  };
}