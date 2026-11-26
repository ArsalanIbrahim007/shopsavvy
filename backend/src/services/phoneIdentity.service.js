// phoneIdentity.service.js — which phone a listing is, read from its title as a key: maker, model, 5G or not, RAM, storage, and
// whether it says non-PTA (2026-11-27). AlfaMall's sellers write one phone a dozen ways ("Samsung A17 5G 8GB 256GB At 0% Markup On
// Upto 6 Months Installments with 1 Year Warranty & PTA Approved By AllTech", "Samsung Galaxy A17 5G | (8GB RAM 256GB) | PTA Approved
// | Official Warranty With Free SURPRISE GIFT", "Samsung Galaxy A17 8GB 256GB 5G Samsung Official Store"), and their store wording
// outweighed the phone's name for the matcher: the A17 5G 8GB 256GB was four products. Two titles with the same key name one phone.
//
// The model is the words before its number (the series: "Hot", "Spark", "Galaxy Z Fold", "Phone"), the number or code ("50", "A17",
// "15C", "X6c"), and the version words right after it ("Pro", "Max", "Plus", "Ultra", "FE", "Lite"); a colour or anything else after
// the number ends it ("Infinix Hot 50 Saga Green" is the Hot 50). "5G" anywhere marks the 5G version (the 4G one seldom says "4G").

import { withoutStoreWording } from "./similarityModel.service.js";
import { extractStorage, extractPtaStatus } from "./normalizeTitle.service.js";
import { extractBrand, extractRamGb } from "./productAttributes.service.js";
import { memoize } from "./memoize.js";

// The maker's own names, left out of the model: "Samsung Galaxy A17" and "Samsung A17" are one phone, as are "Xiaomi Redmi 15C" and
// "Redmi 15C". Not "Redmi", "Poco", "iPhone" or "Pixel": those are the line.
const MAKER_WORDS = new Set([
  "samsung", "galaxy", "apple", "xiaomi", "mi", "oppo", "vivo", "infinix", "tecno", "realme", "honor", "huawei", "nokia", "motorola",
  "google", "oneplus", "nothing", "itel", "sparx", "zte", "lenovo", "sony", "asus", "dcode", "vgotel", "qmobile", "cmf",
]);
const VERSION_WORDS = new Set([
  "pro", "max", "plus", "ultra", "mini", "lite", "fe", "neo", "prime", "edge", "air", "play", "power", "turbo", "xl", "s", "x", "e",
  "go", "slim", "flip", "fold", "classic", "zoom", "curve", "speed", "free", "hd", "i", "c",
]);
// Words that end the model before any number ("Samsung Galaxy 8GB …" names no model).
const NOT_MODEL = /^(\d+(gb|tb|mah|mp|hz|w)|gb|tb|ram|rom|storage|memory|pta|approved|non|official|warranty|with|dual|sim|single|esim|by|on|at|in|for|and|price|pakistan|new|brand|original|box|pack|sealed|mobile|smartphone|cellphone|5g|4g|lte|nfc|version|global|international|edition|black|white|blue|green|gold|silver|grey|gray|purple|red|pink|sky|midnight|starlight|titanium|natural|desert|deep|cosmic|mist|sage|lavender|teal|cloud|ocean|light|dark|space|jet|graphite|phantom|cream|mint|coral|violet|orange|yellow|olive|cyan|lime)$/;
const SERIES_WORD = /^[a-z]+$/; // one letter too: "Galaxy Z Fold 7"

// "8/256", "4/64", "8+256GB": the storage, when extractStorage does not read it.
function storageShorthand(text) {
  const m = String(text).match(/(?<![\d.])\d{1,2}\s*(?:gb)?\s*[+/-]\s*(\d{2,4})\s*(?:gb)?(?![\d.])/i);
  const n = m ? Number(m[1]) : null;
  return n !== null && n >= 16 && n <= 2048 ? n : null;
}

// "8+256", "8/256", "8-256GB", "(256GB - 8GB RAM)", "8GB RAM": the RAM, when extractRamGb does not read it.
function ramOf(text) {
  const stated = extractRamGb(text);
  if (stated !== null) return stated;
  const short = text.match(/(?<![\d.])(\d{1,2})\s*(?:gb)?\s*[+/-]\s*\d{2,4}\s*(?:gb|tb)?(?![\d.])/i) ?? text.match(/\b(\d{2,4})\s*(?:gb|tb)\s*[-/,|]\s*(\d{1,2})\s*gb\s*(?:ram)?\b/i);
  if (!short) return null;
  const n = Number(short[2] ?? short[1]);
  return n >= 1 && n <= 24 ? n : null;
}

function phoneIdentityUncached(title = "") {
  const raw = String(title);
  // Huawei sold Honor phones under its own name: "Huawei Honor 9X" is the Honor 9X.
  const brand = /\bhonor\b/i.test(raw) ? "honor" : extractBrand(raw);
  if (!brand) return null;
  // A bracket without digits is a colour or the box's contents, and may come before the version: "Apple iPhone 13 (Sierra Blue) PRO
  // 128 GB" is the 13 Pro, and was read as the 13 (2026-11-27).
  const text = withoutStoreWording(raw).replace(/\([^()\d]*\)/g, " ").replace(/\b(pro|max|ultra|note)\s*\+/gi, "$1 plus").toLowerCase();
  const words = text.match(/[a-z0-9]+/g) ?? [];
  const model = [];
  let numbered = false;
  for (const word of words) {
    if (MAKER_WORDS.has(word) || word === brand) { if (model.length) break; continue; }
    if (NOT_MODEL.test(word)) break;
    const isNumberish = /\d/.test(word);
    if (!numbered) {
      if (isNumberish) { model.push(word); numbered = true; continue; }
      if (SERIES_WORD.test(word)) { model.push(word); if (model.length > 4) return null; continue; }
      break;
    }
    // after the number: version words only
    if (VERSION_WORDS.has(word)) { model.push(word); continue; }
    break;
  }
  if (model.length === 0) return null;
  // The model spelt one way: spaces left out ("Z Fold7" / "Z Fold 7", "Y05 E" / "Y05e", "Hot50" / "Hot 50"); Apple's "iPhone 17 Air"
  // is the iPhone Air, and Samsung's "Galaxy Fold 5" / "Flip 5" the Z Fold 5 / Z Flip 5.
  let name = model.join("");
  if (brand === "apple") name = name.replace(/^iphone\d+air/, "iphoneair");
  if (brand === "samsung") name = name.replace(/^(fold|flip)/, "z$1");
  return {
    brand,
    model: name,
    network: /\b5g\b/i.test(raw) ? "5g" : "",
    ram: brand === "apple" ? null : ramOf(raw),
    storage: /\b(32|64|128|256|512)\s*\/\s*(64|128|256|512|1024)\s*gb\b/i.test(raw) ? null : extractStorage(raw) ?? storageShorthand(raw),
    nonPta: extractPtaStatus(raw) === "non_pta",
  };
}
export const phoneIdentity = memoize(phoneIdentityUncached);

/** The key two listings of one phone share, or null when the title does not say its maker, model, RAM and storage. */
export function phoneKey(title) {
  const id = phoneIdentity(title);
  // Apple never states an iPhone's RAM: its storage is enough. Other makers sell one model with several RAMs at one storage.
  if (!id || id.storage === null || (id.ram === null && id.brand !== "apple")) return null;
  return `${id.brand}|${id.model}|${id.ram ?? ""}|${id.storage}|${id.nonPta ? "nonpta" : ""}`;
}

/**
 * "5g" when a title says it, else "". Not part of the key: many phones are sold in one version, which some stores call "5G" and
 * others do not (Vivo V70 FE, Galaxy A27 5G), while a few come as a 4G and a 5G phone at different prices (Galaxy A17 8GB 256GB:
 * PKR 80,000 and 97,000). Listings that differ only in it are one phone when priced alike (productGrouping mergeSamePhones).
 */
export const phoneNetwork = (title) => phoneIdentity(title)?.network ?? "";

/** The key without its PTA wording: maker, model, RAM, storage. A product splits only on these (PTA has its own rules). */
export const phoneModelKey = (title) => phoneKey(title)?.replace(/\|(nonpta)?$/, "") ?? null;
