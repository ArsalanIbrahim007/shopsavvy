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

// ---- Appliances (air conditioners, refrigerators, washing machines; added 2026-10-22) ----
// Each reads the RAW title, before normalisation splits "1.5" into "1 5", and each answers null when the title does not say: as
// with PTA status, a matching rule then applies only when both titles state the attribute.

/** An air conditioner's cooling capacity in tons: "1.5 Ton", "1-ton", "2 Tons". */
export function extractTonnage(title = "") {
  const match = String(title).toLowerCase().match(/(\d+(?:\.\d+)?)\s*-?\s*tons?\b/);
  if (!match) return null;
  const tons = Number(match[1]);
  return tons >= 0.5 && tons <= 5 ? tons : null;
}

/**
 * The weights a washing machine states, in kg, as a sorted list: "11.5KG" -> [11.5]; a washer-dryer "11.5KG+8KG" -> [8, 11.5].
 * Null when none, or when a value is not a plausible drum (3 to 30 kg).
 */
export function extractCapacityKg(title = "") {
  const values = [...String(title).toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*kgs?\b/g)].map((m) => Number(m[1]));
  if (values.length === 0 || values.some((v) => v < 3 || v > 30)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

const LITRES_PER_CUBIC_FOOT = 28.3168;

/** A refrigerator's volume in litres: "350 Ltr", "350L", "15 cu ft" / "15 CFT" (converted). Null when unstated or implausible. */
export function extractVolumeLitres(title = "") {
  const text = String(title).toLowerCase();
  const litres = text.match(/(\d{2,4})\s*(?:l|lt|ltr|ltrs|litres?|liters?)\b/);
  if (litres) {
    const value = Number(litres[1]);
    return value >= 40 && value <= 1500 ? value : null;
  }
  const cubic = text.match(/(\d+(?:\.\d+)?)\s*(?:cu\.?\s*ft\.?|cft|cubic\s*f(?:ee|oo)t)/);
  if (cubic) {
    const value = Math.round(Number(cubic[1]) * LITRES_PER_CUBIC_FOOT);
    return value >= 40 && value <= 1500 ? value : null;
  }
  return null;
}

// Air-conditioner series: one brand sells several at the same tonnage, at prices far apart (TCL BreezeIN against FreshIN 1.5 ton:
// PKR 196,499 against 227,999 at one store). Taken from the words that recur in the catalogue's AC titles and from the appliance
// evaluation's wrong merges (2026-10-22), so a series missing here is simply not compared. Feature words that several series share
// ("turbo", "smart", "boost", "extreme") are left out.
const AC_SERIES = [
  // Dawlance
  ["magna", /\bmagna\b/], ["hyper", /\bhyper\b/], ["infinity", /\binfinity\b/], ["designer", /\bdesigner\b/],
  ["sprinter", /\bsprinter\b/], ["elegance", /\belegance\b/], ["econo", /\becono\b/], ["aura", /\baura\b/],
  ["powercon", /\bpowercon\b/], ["mega", /\bmega\b/], ["inspire", /\binspire\b/], ["aeromax", /\baeromax\b/], ["chrome", /\bchrome\b/],
  ["suave", /\bsuave\b/],
  // TCL
  ["breezein", /\bbreeze\s?in\b/], ["freshin", /\bfresh\s?in\b/], ["savein", /\bsave\s?in\b/], ["voxin", /\bvox\s?in\b/],
  ["elite", /\belite\b/], ["miracle", /\bmiracle\b/], ["tpro", /\bt\s?-?\s?pro\b/],
  // Orient, Gree, Haier, Kenwood
  ["ultron", /\bultron\b/], ["ecomfort", /\be[\s-]?comfort\b/], ["airy", /\bairy\b/], ["pular", /\bpular\b/], ["fairy", /\bfairy\b/],
  ["pearl", /\bpearl\b/], ["flexis", /\bflexis\b/], ["puri", /\bpuri\b/], ["onyx", /\bonyx\b/], ["enova", /\benova\b/], ["oasis", /\boasis\b/],
];

// Refrigerator series, the same way: Dawlance sells its 9178 (12 cu ft) as Chrome, Avante, Avante+ and Acce, at different prices.
const FRIDGE_SERIES = [
  ["chrome", /\bchrome\b/], ["avante", /\bavante\b(?!\s?(?:\+|plus))/], ["avanteplus", /\bavante\s?(?:\+|plus)/], ["acce", /\bacce\b/],
];

const seriesIn = (list, title) => {
  const text = String(title).toLowerCase();
  return new Set(list.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
};

/** The air-conditioner series a title names (see AC_SERIES), as a set; empty when it names none. */
export function extractAcSeries(title = "") {
  return seriesIn(AC_SERIES, title);
}

/** The refrigerator series a title names (see FRIDGE_SERIES), as a set; empty when it names none. */
export function extractFridgeSeries(title = "") {
  return seriesIn(FRIDGE_SERIES, title);
}

/** True when a title names a refrigerator or freezer. */
export function isFridgeTitle(title = "") {
  return /\b(?:refrigerator|fridge|freezer)\b/.test(String(title).toLowerCase());
}

// What is cut from an appliance title before its model numbers are read: capacities and sizes with their unit, years, and the
// seller codes DigiMall appends ("ISPK-0577"), which differ between two sellers of one product. A bare "W" or "GB" after a number
// is left: in "DW-6550W" and "DW-10095 GB" they are part of the model, not watts or gigabytes.
const NOT_MODEL_NUMBERS = [
  /\d+(?:\.\d+)?\s*(?:kgs?|ltrs?|litres?|liters?|l|cu\.?\s*ft\.?|cft|cubic\s*f\w+|tons?|inch(?:es)?|hz|watts?|mah|mm|cm|months?|years?|days?)\b/g,
  /\b20[0-3]\d\b/g,
  /\bispk-?\d+/g,
  /\d+\s*%/g,
];

/**
 * The model numbers in an appliance title: every run of 3 to 6 digits once capacities, years and seller codes are cut, as a set.
 * "Dawlance DWT 9560" -> {9560}, "(DWT-1165PL)" -> {1165}, "HWM 100-826S6" -> {100, 826}. Stores write the code with a hyphen, a
 * space or neither, so the digits are what two titles of one model share.
 */
export function extractModelNumbers(title = "") {
  let text = String(title).toLowerCase();
  for (const pattern of NOT_MODEL_NUMBERS) text = text.replace(pattern, " ");
  return new Set(text.match(/(?<!\d)\d{3,6}(?!\d)/g) ?? []);
}

const APPLIANCE_NAME = /\b(?:refrigerator|fridge|freezer|washing\s*machine|washer|dryer|air\s*conditioner|split\s*ac)\b/;

/** True when a title names an appliance: by what it is ("refrigerator"), its capacity (tonnage, drum weight, volume) or its kind. */
export function isApplianceTitle(title = "") {
  return APPLIANCE_NAME.test(String(title).toLowerCase()) || extractTonnage(title) !== null || extractCapacityKg(title) !== null
    || extractVolumeLitres(title) !== null || extractApplianceType(title) !== null;
}

/** "inverter" or "non_inverter" as the title says ("DC Inverter", "Non-Inverter"), else null. */
export function extractInverter(title = "") {
  const text = String(title).toLowerCase();
  if (/\bnon[\s-]?inverter\b/.test(text)) return "non_inverter";
  if (/\binverter\b/.test(text)) return "inverter";
  return null;
}

/**
 * The kind of appliance a title names within its category, when it names one: an air conditioner's "split", "window",
 * "portable" or "floor" (standing); a washing machine's "front" or "top" load, or "twin" tub (semi-automatic); a refrigerator's
 * "side_by_side", "double_door", "single_door" or "freezer" (a deep, chest or upright freezer). Null when it names none, or more
 * than one of the same family (a listing of several kinds).
 */
export function extractApplianceType(title = "") {
  const text = String(title).toLowerCase();
  const families = [
    [["split", /\bsplit\b/], ["window", /\bwindow\s*(?:ac|air)/], ["portable", /\bportable\b/], ["floor", /\bfloor\s*stand/]],
    [["front", /\bfront[\s-]*load/], ["top", /\btop[\s-]*load/], ["twin", /\btwin[\s-]*tub|\bsemi[\s-]*auto/]],
    [["side_by_side", /\bside[\s-]*by[\s-]*side\b/], ["double_door", /\b(?:double|two|2)[\s-]*door/], ["single_door", /\b(?:single|one|1)[\s-]*door/], ["freezer", /\b(?:deep|chest|upright)\s*freezer\b/]],
  ];
  for (const family of families) {
    const found = family.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    if (found.length === 1) return found[0];
  }
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
  // Marketplace sellers (AlfaMall) sell used laptops as "Like New"; a new one never needs saying so.
  if (/\blike[\s-]?new\b/.test(text)) return "used";
  if (/\b(open box|openbox)\b/.test(text)) return "open_box";
  // Paklap sells marked units as "Brand New, Light Cosmetic Marks" beside plain "NEW" ones of the same laptop, cheaper. The words
  // "brand new" are in the title, but the unit is not the one a shopper buying new gets: closest to an open-box unit.
  if (/\bcosmetic (marks?|scratch(es)?|damage)\b/.test(text)) return "open_box";
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