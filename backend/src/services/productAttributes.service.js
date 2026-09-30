import { detectCategory } from "../scrapers/productCategory.js";

/**
 * Derives structured attributes from a product title.
 *
 * These are extracted once when a listing is collected and stored on the
 * document. Deriving them at query time would re-parse every title on every
 * search, and would leave the database unable to answer questions such as
 * "which storage capacities are available for this product".
 */

export const COLOURS = [
  "natural titanium", "desert titanium", "space grey", "space gray",
  "titanium", "graphite", "midnight", "starlight", "ultramarine",
  "lavender", "sky blue", "black", "white", "silver", "gold", "grey", "gray",
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

// A colour counts only as a whole word. Plain substring matching read "Redmi" as red (41 phones showed a
// "Red" colour filter because of it), "Blackview" as black and "Goldmedal" as gold. A few brand names are
// also ordinary colour words, so they are excluded explicitly: "Red Magic" phones, "Green Lion" accessories.
const NOT_A_COLOUR = { red: "(?!\\s+magic\\b)", green: "(?!\\s+lion\\b)" };

const COLOUR_PATTERNS = COLOURS.map((colour) => ({
  colour,
  pattern: new RegExp(`\\b${colour.replace(" ", "\\s*")}\\b${NOT_A_COLOUR[colour] ?? ""}`),
}));

export function extractColour(title = "") {
  const text = String(title).toLowerCase();

  // Longer names first, so "space grey" is preferred over "grey".
  const match = COLOUR_PATTERNS.find(({ pattern }) => pattern.test(text))?.colour;
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

/**
 * The network generation a title states: 5 for "5G", 4 for "4G" / "LTE", null when it says neither (most
 * stores simply leave it out) or names both ("4G/5G"). Two handsets that state DIFFERENT generations are
 * different products (Galaxy A17 4G and A17 5G sell for PKR 65,000 and PKR 99,000), but silence proves
 * nothing: many stores omit "5G" from phones that have it.
 */
export function extractNetworkGeneration(title = "") {
  const text = String(title).toLowerCase();
  const five = /\b5\s?g\b/.test(text);
  const four = /\b4\s?g\b|\blte\b/.test(text);
  if (five && !four) return 5;
  if (four && !five) return 4;
  return null;
}

/** A title with its network-generation words removed, so "A17" and "A17 5G" have the same family key. */
export function networkFamilyKey(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/\b[45]\s?g\b|\blte\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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