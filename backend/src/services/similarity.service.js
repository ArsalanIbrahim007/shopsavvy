import { MEMO_LIMIT, memoize } from "./memoize.js";
import {
  extractStorage,
  modelTokens,
  extractScreenInches,
  extractPtaStatus,
  extractModelCodes,
  extractSpecs,
} from "./normalizeTitle.service.js";
import {
  extractRamGb, extractCondition, extractNetworkGeneration,
  extractTonnage, extractCapacityKg, extractVolumeLitres, extractInverter, extractApplianceType, extractAcSeries,
  extractModelNumbers, isApplianceTitle, extractFridgeSeries, isFridgeTitle,
} from "./productAttributes.service.js";

/**
 * Words marking a distinct product tier rather than describing the same
 * device. "Pro" and "Pro Max" are different phones.
 */
export const VARIANT_TOKENS = new Set([
  "pro", "max", "plus", "ultra", "mini", "air", "fe", "lite", "se",
]);

// Grouping tokenises the same few thousand titles millions of times (17% of its time once normalizeTitle was cached, 2026-10-26),
// so each answer is kept; frozen, because callers share it, and a caller that tried to change it would fail loudly rather than
// corrupt another's. Emptied at MEMO_LIMIT entries, so memory stays bounded (memoize.js).
const TOKENIZE_LIMIT = MEMO_LIMIT;
const tokenized = new Map();

export function tokenize(text = "") {
  const key = String(text);
  let tokens = tokenized.get(key);
  if (tokens === undefined) {
    if (tokenized.size >= TOKENIZE_LIMIT) tokenized.clear();
    tokens = Object.freeze(key.toLowerCase().split(" ").map((t) => t.trim()).filter(Boolean));
    tokenized.set(key, tokens);
  }
  return tokens;
}

export function calculateJaccardSimilarity(textA = "", textB = "") {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

export function getSimilarityPercentage(textA = "", textB = "") {
  return Math.round(calculateJaccardSimilarity(textA, textB) * 100);
}

/**
 * "Pro+", "Pro +" and "S25+" are written forms of "Plus": Redmi Note 14 Pro+ is a different, dearer phone than the Pro, and a
 * store that writes the symbol must not be read as the plain model. Only after a model or tier word, so "8GB + 256GB" (RAM and
 * storage) is left alone. modelTokens drops the symbol, so it is turned into the word before that.
 */
const PLUS_AFTER_MODEL = new RegExp("\\b(pro|max|ultra|mini|air|lite|fe|se|edge|[sa]\\d{2,3}|note\\s?\\d{1,2})\\s?\\+(?![\\w])", "gi");

function extractVariantsUncached(text = "") {
  const written = String(text).replace(PLUS_AFTER_MODEL, "$1 plus");
  return new Set(tokenize(modelTokens(written)).filter((t) => VARIANT_TOKENS.has(t)));
}

/**
 * Two model codes name the same model when equal or when one only adds a
 * trailing letter or two -- a regional SKU suffix (Galaxy Watch 7 "L310" vs
 * "L310F"). Differing digits are a different model ("L500" Bluetooth vs
 * "L505" LTE).
 */
function sameModelCode(a, b) {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(short) && /^[a-z]{1,2}$/.test(long.slice(short.length));
}

// A bare number after these words describes an operating system, CPU family or
// generation counter rather than which model it is, and stores omit or vary it
// ("Windows 11", "Ryzen 5", "Gen 7").
const NON_MODEL_NUMBER_PRECEDERS = new Set([
  "windows", "win", "android", "ios", "ipados", "gen", "generation", "ryzen", "core", "pack", "of",
]);

/**
 * The bare numbers in a title that name the model within a product line:
 * "Fold 5", "Reno 4", "Watch 8", "Buds 3", "iPhone 17". Capacities and sizes
 * carry units ("256GB", "40mm") and are not pure numbers, so they are not
 * counted here.
 */
function seriesNumbersUncached(text = "") {
  const tokens = tokenize(modelTokens(text));
  const found = new Set();
  tokens.forEach((token, i) => {
    if (/^\d{1,2}$/.test(token) && !NON_MODEL_NUMBER_PRECEDERS.has(tokens[i - 1])) found.add(token);
  });
  return found;
}

// A number followed by these words counts something sold with the product ("1 Year Warranty", "7 Sets Straps"), not the model.
const COUNTED_WORDS = new Set([
  "year", "years", "yr", "month", "months", "day", "days", "set", "sets", "pcs", "pieces", "piece", "straps", "strap", "colors", "colours",
]);

/**
 * The bare numbers of a title (up to three digits) with the word before each: "ThinkBook 14" gives ["thinkbook", "14"], "Max 585"
 * ["max", "585"], "Gus-03" ["gus", "03"], and a decimal its two halves ("2.1 ch" gives ["2", "1"]). A number after a word naming an
 * operating system or CPU family, or one counting something ("1 Year Warranty"), is left out.
 */
function slotNumbersUncached(text = "") {
  const tokens = tokenize(modelTokens(text));
  const found = [];
  tokens.forEach((token, i) => {
    const before = tokens[i - 1];
    // A trailing letter is part of the model ("Note 11T", "Redmi 15C") unless it is a unit or marker ("5G", "4K", "65W").
    const isNumber = /^\d{1,3}$/.test(token) || (/^\d{1,3}[a-z]$/.test(token) && !UNIT_SUFFIX_LETTERS.has(token.slice(-1)));
    if (!isNumber || !before) return;
    if (NON_MODEL_NUMBER_PRECEDERS.has(before) || COUNTED_WORDS.has(tokens[i + 1])) return;
    found.push([before, token]);
  });
  return found;
}

/**
 * The numbers of a title keyed by the word before them. Two titles that put different numbers after the same word name different
 * models: "ThinkBook 14" / "ThinkBook 16", "Max 585" / "Max 580", "Gus-03" / "Gus-01". seriesNumbers alone missed these whenever
 * the titles shared some other number ("Core Ultra 7" in both ThinkBooks, "Ultra 3" in both watches).
 */
function numberSlotsUncached(text = "") {
  const slots = new Map();
  for (const [word, number] of slotNumbers(text)) {
    if (!slots.has(word)) slots.set(word, new Set());
    slots.get(word).add(number);
  }
  return slots;
}

/**
 * True when one title carries no model number and the other carries exactly one, written inside the model name, before a tier word.
 * "Galaxy Buds Pro" against "Galaxy Buds 2 Pro": the unnumbered one is the first generation, a different product. A number only
 * added at the end ("Galaxy Watch Ultra" / "Watch Ultra 2 47mm") is left alone, as stores use it loosely for a newer edition of the
 * same watch. Laptop titles carry several numbers and never reach this.
 */
function unnumberedGeneration(textA, textB) {
  const a = slotNumbers(textA);
  const b = slotNumbers(textB);
  const [numbered, numberedText] = a.length === 0 ? [b, textB] : b.length === 0 ? [a, textA] : [null, null];
  if (!numbered || numbered.length !== 1) return false;
  const [word, number] = numbered[0];
  const tokens = tokenize(modelTokens(numberedText));
  return VARIANT_TOKENS.has(tokens[tokens.indexOf(number, tokens.indexOf(word)) + 1]);
}

// Words that name a separate product line of a brand, never store wording: Redmi Note 7 Pro is not Redmi 7 Pro, nor Redmi 9A Sport a
// Redmi 9A, Galaxy Watch 8 Classic a Galaxy Watch 8, Galaxy S7 edge a Galaxy S7, Redmi 10 Prime a Redmi 10, Honor 10 GT an Honor 10,
// or Redmi 9 Power a Redmi 9.
const LINE_WORDS = new Set(["note", "sport", "classic", "fold", "flip", "edge", "prime", "gt", "power"]);

/**
 * "cellular" when a title says the unit has a SIM connection, "wifi" when it says Wi-Fi and nothing cellular, else null. A tablet's
 * Wi-Fi and cellular versions are different products at different prices ("Redmi Pad 2 4G" against "Redmi Pad 2 8GB 256GB - Wifi",
 * "Tab S11 Ultra 5G" against "Wifi"). A cellular unit usually also lists Wi-Fi, so cellular words win.
 */
function connectivityUncached(text = "") {
  const lower = String(text).toLowerCase();
  if (/\b(cellular|lte|[345]g)\b/.test(lower)) return "cellular";
  if (/\bwi-?fi\b/.test(lower)) return "wifi";
  return null;
}

/** Both titles name a series, and none in common. */
const disjointSeries = (a, b) => a.size > 0 && b.size > 0 && ![...a].some((s) => b.has(s));

// Two volumes within this share are one refrigerator: stores convert cubic feet to litres and round differently.
const VOLUME_TOLERANCE = 0.05;

/**
 * True when two titles state a different tonnage, drum weight, volume, inverter type or appliance kind (see productAttributes), or
 * are two air conditioners (both state a tonnage) of different series: "Dawlance Magna T3" against "Hyper T3". The same full
 * hyphenated model code on both outranks the series words. A short code does not: TCL uses "18T5" in its BreezeIN and FreshIN series.
 */
export function applianceConflict(textA, textB) {
  const differ = (a, b) => a !== null && b !== null && a !== b;
  const tonsA = extractTonnage(textA);
  const tonsB = extractTonnage(textB);
  if (differ(tonsA, tonsB)) return true;
  const hyphenB = hyphenModelCodes(textB);
  const shareCode = [...hyphenModelCodes(textA)].some((a) => [...hyphenB].some((b) => sameHyphenCode(a, b)));
  if (tonsA !== null && tonsB !== null && !shareCode) {
    if (disjointSeries(extractAcSeries(textA), extractAcSeries(textB))) return true;
  }
  if (isFridgeTitle(textA) && isFridgeTitle(textB) && disjointSeries(extractFridgeSeries(textA), extractFridgeSeries(textB))) return true;
  const kgA = extractCapacityKg(textA);
  const kgB = extractCapacityKg(textB);
  if (kgA && kgB && kgA.join("+") !== kgB.join("+")) return true;
  const litresA = extractVolumeLitres(textA);
  const litresB = extractVolumeLitres(textB);
  if (litresA !== null && litresB !== null && Math.abs(litresA - litresB) / Math.max(litresA, litresB) > VOLUME_TOLERANCE) return true;
  if (differ(extractInverter(textA), extractInverter(textB))) return true;
  if (differ(extractApplianceType(textA), extractApplianceType(textB))) return true;
  // Two appliances whose model numbers differ ("DWT-1165PL" / "DWT 9560", "REF-9149" / "REF-9140"): different unless one title's
  // numbers are all in the other (one store adds a version number). Only between two appliance titles, as phone and laptop titles
  // carry other numbers.
  if (isApplianceTitle(textA) && isApplianceTitle(textB)) {
    const numbersA = extractModelNumbers(textA);
    const numbersB = extractModelNumbers(textB);
    const within = (small, big) => [...small].every((n) => big.has(n));
    if (numbersA.size > 0 && numbersB.size > 0 && !within(numbersA, numbersB) && !within(numbersB, numbersA)) return true;
  }
  return false;
}

function lineWordsUncached(text = "") {
  return new Set(tokenize(modelTokens(text)).filter((t) => LINE_WORDS.has(t)));
}

// A trailing letter that is a unit or a connectivity/resolution marker, not part of
// a model name: "5G", "4K", "65W", "1L", "10M", "5V", "50P".
const UNIT_SUFFIX_LETTERS = new Set(["g", "k", "w", "l", "m", "h", "v", "p"]);

/**
 * Two-character model identifiers too short to count as model codes: a letter
 * then digits ("Y6", "G8", "M5", "A3") or digits then a letter ("7X", "3A").
 * Returned keyed by what distinguishes them: the leading letter for the first
 * form, the digits for the second, so "g8" and "g9" (same letter, different
 * digits) can be recognised as competing values of the same slot.
 */
function shortModelIdsUncached(text = "") {
  const slots = new Map();
  const add = (slot, value) => {
    if (!slots.has(slot)) slots.set(slot, new Set());
    slots.get(slot).add(value);
  };
  tokenize(modelTokens(text)).forEach((token) => {
    if (/^[a-z]\d{1,2}$/.test(token) && !/^[2-5]g$/.test(token)) add("letter:" + token[0], token.slice(1));
    else if (/^\d{1,2}[a-z]$/.test(token) && !UNIT_SUFFIX_LETTERS.has(token.slice(-1))) add("digits:" + token.slice(0, -1), token.slice(-1));
  });
  return slots;
}

// Words before a hyphen and a number that are not a model prefix ("Pro-11" is a unit version, "Gen-12" a generation, "ISPK-0577"
// a DigiMall seller's code).
const NOT_A_CODE_PREFIX = new Set([...VARIANT_TOKENS, ...LINE_WORDS, ...NON_MODEL_NUMBER_PRECEDERS, "type", "usb", "wifi", "in", "ispk"]);
// The last lookahead leaves out a number followed by an appliance unit: "Haier-10 kg" is a capacity. Not GB: "DW-10095 GB" is a
// washing machine's model.
const HYPHEN_CODE =
  /(?<![a-z0-9])([a-z]{1,5}\d{0,3})-(\d[a-z0-9]*(?:-[a-z0-9]*\d[a-z0-9]*)*)(?![a-z0-9])(?!\s*(?:kgs?|ltrs?|l|tons?|inch|cft|cu)\b)/g;
// Single-letter units (w, l) are left out: in "DW-6550W" the W is the colour, not watts.
const CAPACITY_PART = /^\d+(?:\.\d+)?(gb|tb|kg|kgs|ltr|ltrs|ton|tons|cft|inch|mah|hz|mm)$/;

/**
 * Model codes written with a hyphen, read from the raw title: "PRLP-21860", "HD-60-50", "T24-4v", lower-cased. normalizeTitle
 * splits these into a word and a bare number, so extractModelCodes never sees them, and two appliances differing only in their
 * model number ("REF-9149" / "REF-9140", "DW-10095" / "DW-6550C") were grouped (found by the appliance evaluation, 2026-10-22). A
 * code needs two digits; a prefix that is a tier or generation word, or a capacity after the hyphen ("S24-256GB"), is not one.
 */
function hyphenModelCodesUncached(text = "") {
  const codes = new Set();
  for (const [code, prefix, rest] of String(text).toLowerCase().matchAll(HYPHEN_CODE)) {
    if (NOT_A_CODE_PREFIX.has(prefix) || CAPACITY_PART.test(rest)) continue;
    if ((code.match(/\d/g) ?? []).length >= 2) codes.add(code);
  }
  return codes;
}

/**
 * The parts of a hyphenated code that name the model: a leading all-letter part is the store's or maker's prefix and is dropped
 * ("HTW-100-196E" and "HWM-100-196E" are one Haier twin tub), and one letter after a number is a colour ("DW-6550C" / "DW-6550W").
 */
const codeParts = (code) => {
  const parts = code.split("-").map((part) => part.replace(/(\d)[a-z]$/, "$1"));
  return /^[a-z]+$/.test(parts[0]) ? parts.slice(1) : parts;
};

/**
 * One model when the parts agree, when one code only adds parts at the end (a unit version: "TAC-18T3B" / "TAC-18T3B-2"), or when
 * its last part only adds letters ("HDF-465" / "HDF-465INV", "DWT-1470" / "DWT-1470PL": stores drop the suffix or space it off).
 */
function sameHyphenCode(a, b) {
  const [short, long] = [codeParts(a), codeParts(b)].sort((x, y) => x.length - y.length);
  return short.every((part, i) => part === long[i] || (i === short.length - 1 && /^[a-z]+$/.test(long[i].slice(part.length))
    && long[i].startsWith(part)));
}

/**
 * Model codes with a leading screen size dropped: stores write a television's code with or without its size in front ("98DU9000"
 * / "DU9000", "75U8000F" / "U8000F"), which kept one Samsung 98 inch DU9000 at two stores apart (found by the recall sample,
 * 2026-10-26). The prefix is dropped only when it is a screen size one of the two titles states (`sizes`, as strings), so a
 * leading number that names the model ("12T3" against "18T3", two TCL air conditioners) is never dropped; the sizes themselves
 * are compared separately. Used by the veto here and by the trained matcher's model-code feature (ml/features.js).
 */
export function withoutSizePrefix(codes, sizes) {
  if (sizes.size === 0) return codes;
  return new Set([...codes].map((code) => {
    const match = /^(\d{2,3})([a-z][a-z0-9]{2,})$/.exec(code);
    return match && sizes.has(match[1]) ? match[2] : code;
  }));
}

/** The screen sizes two titles state, as whole-number strings, for withoutSizePrefix. */
export function statedSizes(textA, textB) {
  return new Set([extractScreenInches(textA), extractScreenInches(textB)].filter((size) => size !== null).map((size) => String(Math.round(size))));
}

export function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Attributes that materially change what the buyer receives are treated as
 * constraints, not as evidence. Each is a single token inside a long title, so
 * a set based similarity score cannot give it the weight it deserves: a 256GB
 * and a 1TB unit differ by one token out of six, as do a Pro and a Pro Max, a
 * 65 inch and an 85 inch television, and a PTA approved and non approved
 * handset. Where both listings declare such an attribute and the values
 * differ, they are different products whatever their similarity score.
 */
export function attributeConflict(textA, textB, { ignoreUnstatedStorage = false } = {}) {
  // Capacity blocks a match when both sides state it and the values differ.
  // When exactly one side states it equivalence is unproven, which is what
  // stopped a bare "iPhone 16 Pro Max" being compared against a 256GB unit at
  // a difference of PKR 140,000. Two listings that both omit it, such as
  // televisions, are not in conflict.
  const storageA = extractStorage(textA);
  const storageB = extractStorage(textB);
  const oneStorageUnstated = (storageA === null) !== (storageB === null);

  if (storageA !== null && storageB !== null && storageA !== storageB) return true;
  if (oneStorageUnstated && !ignoreUnstatedStorage) return true;

  // Memory is stated alongside storage on some stores, as in
  // "(12GB RAM + 256GB Storage)". Both variants share a storage capacity, so
  // without this check an 8GB and a 12GB unit are treated as one product.
  const ramA = extractRamGb(textA);
  const ramB = extractRamGb(textB);
  if (ramA !== null && ramB !== null && ramA !== ramB) return true;

  const screenA = extractScreenInches(textA);
  const screenB = extractScreenInches(textB);
  if (screenA !== null && screenB !== null && screenA !== screenB) return true;

  // Approval status blocks a match only when both listings state it. Most
  // stores are silent on the point, and treating silence as a conflict split
  // the same handset across every platform that did not mention it.
  const ptaA = extractPtaStatus(textA);
  const ptaB = extractPtaStatus(textB);
  if (ptaA !== "unknown" && ptaB !== "unknown" && ptaA !== ptaB) return true;

  // A 4G and a 5G version of a phone are different products at very different prices. Like approval status,
  // this blocks a match only when BOTH titles state a generation and they differ: stores often omit "5G".
  const networkA = extractNetworkGeneration(textA);
  const networkB = extractNetworkGeneration(textB);
  if (networkA !== null && networkB !== null && networkA !== networkB) return true;

  // Model codes conflict only when both titles state some and they share
  // none. Requiring identical sets split a store that appends a SKU ("S24
  // Ultra (SM-S928B)") from one that doesn't ("S24 Ultra") once short codes
  // like "s24" count; the same one-sided extra is not evidence of a
  // different product.
  const sizes = statedSizes(textA, textB);
  const codesA = withoutSizePrefix(extractModelCodes(textA), sizes);
  const codesB = withoutSizePrefix(extractModelCodes(textB), sizes);
  if (
    codesA.size > 0 &&
    codesB.size > 0 &&
    ![...codesA].some((a) => [...codesB].some((b) => sameModelCode(a, b)))
  ) return true;

  // The same for hyphenated codes, which the check above never sees (see hyphenModelCodes).
  const hyphenA = hyphenModelCodes(textA);
  const hyphenB = hyphenModelCodes(textB);
  if (hyphenA.size > 0 && hyphenB.size > 0 && ![...hyphenA].some((a) => [...hyphenB].some((b) => sameHyphenCode(a, b)))) return true;

  // A specification both titles state must share a value: a 40mm and a 44mm
  // watch, or a 12th- and 13th-gen laptop, are different products. Disjoint
  // rather than unequal, because one store may list more values for the same
  // unit ("50MP" vs "50MP + 12MP") while describing the same phone. A spec
  // only one title mentions proves nothing either way.
  const specsA = extractSpecs(textA);
  const specsB = extractSpecs(textB);
  for (const [unit, valuesA] of specsA) {
    const valuesB = specsB.get(unit);
    if (valuesB && ![...valuesA].some((v) => valuesB.has(v))) return true;
  }

  // Different series numbers ("Z Fold 5" / "Z Fold 7", "Reno 4" / "Reno 6") are
  // different products. Like model codes, this blocks only when both titles
  // state numbers and share none: one side omitting it proves nothing. Before
  // this check, stores' wording noise ("Dual Sim With Official Warranty") could
  // outweigh a single differing digit in both the rule and the classifier.
  const numbersA = seriesNumbers(textA);
  const numbersB = seriesNumbers(textB);
  if (
    numbersA.size > 0 &&
    numbersB.size > 0 &&
    ![...numbersA].some((n) => numbersB.has(n))
  ) return true;

  // The same slot holding different values is a different model: "G8" / "G9",
  // "M4" / "M5", "Y6" / "Y5", "7X" / "7i". These are checked per slot rather than
  // as a shared set because titles often share a size ("ThinkBook 16 G8" and
  // "16 G9" both say 16), which would hide the difference.
  const idsA = shortModelIds(textA);
  const idsB = shortModelIds(textB);
  for (const [slot, valuesA] of idsA) {
    const valuesB = idsB.get(slot);
    if (valuesB && ![...valuesA].some((v) => valuesB.has(v))) return true;
  }

  // The same word followed by different numbers (see numberSlots), and a first generation against a numbered one.
  const slotsA = numberSlots(textA);
  const slotsB = numberSlots(textB);
  for (const [word, valuesA] of slotsA) {
    const valuesB = slotsB.get(word);
    if (valuesB && ![...valuesA].some((v) => valuesB.has(v))) return true;
  }
  if (unnumberedGeneration(textA, textB)) return true;

  if (!sameSet(lineWords(textA), lineWords(textB))) return true;

  // Wi-Fi only against cellular, when both titles say (most phone titles say neither, or only "5G").
  const linkA = connectivity(textA);
  const linkB = connectivity(textB);
  if (linkA !== null && linkB !== null && linkA !== linkB) return true;

  // Appliances: a 1-ton and a 1.5-ton air conditioner, an 8 kg and a 10 kg washing machine, a 350- and a 450-litre refrigerator,
  // an inverter and a non-inverter model, a window and a split AC are different products. Like every rule here, each applies only
  // when both titles state the attribute.
  if (applianceConflict(textA, textB)) return true;

  if (!sameSet(extractVariants(textA), extractVariants(textB))) return true;

  // A used/refurbished/open-box unit is not the same product as a new one at
  // a different price -- it's a different product at a genuinely different
  // price, and letting the two group together lets a used listing's lower
  // price win "Best Deal" against new ones, which is misleading. Unlike PTA
  // status, extractCondition() has no "unstated" case -- silence defaults to
  // "new" -- so a plain != comparison already does the right thing without
  // an unknown-value carve-out.
  if (extractCondition(textA) !== extractCondition(textB)) return true;

  return false;
}

export function isSimilarProduct(textA = "", textB = "", threshold = 0.7, opts = {}) {
  if (attributeConflict(textA, textB, opts)) return false;

  const baseA = tokenize(modelTokens(textA)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");
  const baseB = tokenize(modelTokens(textB)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");

  return calculateJaccardSimilarity(baseA, baseB) >= threshold;
}

// The pure title readers above keep their answers, so grouping does not re-read the same titles millions of times (memoize.js).
export const extractVariants = memoize(extractVariantsUncached);
export const seriesNumbers = memoize(seriesNumbersUncached);
export const numberSlots = memoize(numberSlotsUncached);
export const connectivity = memoize(connectivityUncached);
export const lineWords = memoize(lineWordsUncached);
export const shortModelIds = memoize(shortModelIdsUncached);
export const hyphenModelCodes = memoize(hyphenModelCodesUncached);
const slotNumbers = memoize(slotNumbersUncached);
