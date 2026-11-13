// normalize.js — a store's label/value pairs (extractors.js) in, the canonical typed sheet out (specsEngine.service.js SPEC_FIELDS).
//
// Stores name one thing many ways and put several things in one value, so a label is matched by what it means and a value read by
// its unit (all seen on real pages, 2026-11-09):
//   "Battery Type: 5000 mAh" (iShopping), "Battery Type: 3692 mAh" (PriceOye, its "Type" in the "Battery" group),
//   "Battery: 5500mAh, 45W Turbo Charging" (Techroid: battery and charging in one value),
//   "Display: 6.67" AMOLED, 2400 x 1080 resolution, 120Hz refresh rate" (eezepc: size, panel and refresh rate in one value),
//   "Screen Type: AMOLED (90HZ)", "Installed RAM: 8 GB", "Hard drive size: 512 GB SSD", "Weight: 1.83kg" (Paklap, a laptop).
// A value that lists several variants ("RAM: 4/6 GB", "Internal Memory: 256GB / 512GB", "Storage: 8GB - 256GB 12GB - 512GB") says
// nothing about the one being sold, so RAM and storage are taken only from a value with a single capacity; the listing's own title
// (productAttributes) states its variant anyway. Nothing is guessed: a field the page does not state is left out.

/** The numbers in a text before a unit ("50 MP + 12 MP" -> [50, 12]). */
// A thousands comma is part of a number: read as a break, "3,692 mAh" gave an iPhone 17 a 692 mAh battery (2026-11-10).
const numbersBefore = (text, unit) =>
  [...String(text).matchAll(new RegExp(`(?<![\\d.,])(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(?:${unit})(?![a-z])`, "gi"))]
    .map((m) => Number(m[1].replace(/,/g, "")));
const isNotStated = (value) => /^\s*(n\/?a|-+|none|not available|unknown|tbd)\s*$/i.test(String(value));

function parseBool(value) {
  const v = String(value).trim().toLowerCase();
  if (/^(yes|true|supported|available|built-?in)\b/.test(v)) return true;
  if (/^(no|false|not supported|unavailable)\b/.test(v)) return false;
  return null;
}

/** One capacity in GB, or null when the value states none or several ("4/6 GB", "8GB + 128GB 12GB + 256GB"). */
function singleCapacityGb(value) {
  const text = String(value);
  if (/\d\s*\/\s*\d/.test(text)) return null; // "4/6 GB", "256GB / 512GB"
  // Digits, not word edges: a variant picker's text runs together ("Choose an option8GB - 256GBClear").
  const found = [...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(gb|tb)/gi)].map((m) => (m[2].toLowerCase() === "tb" ? Number(m[1]) * 1024 : Number(m[1])));
  const distinct = [...new Set(found)];
  if (distinct.length === 1) return distinct[0];
  if (distinct.length === 0 && /^\s*\d+(\.\d+)?\s*$/.test(text)) return Number(text); // a bare number under a capacity label
  return null;
}

/** A screen size in inches from "6.7 Inches", "6.6"", "6.67″ AMOLED", "15.6-Inch WUXGA", or a bare "15.6" under a size label. */
function inches(value, { bare = false } = {}) {
  const m = String(value).match(/(\d{1,2}(?:\.\d+)?)\s*(?:["″”]|''|-?\s*inch(?:es)?\b|-?\s*in\b)/i);
  if (m) return Number(m[1]);
  if (bare) {
    const n = String(value).match(/^\s*(\d{1,2}(?:\.\d+)?)\s*$/);
    if (n) return Number(n[1]);
  }
  return null;
}

function displayType(value) {
  const v = String(value).toUpperCase();
  if (v.includes("AMOLED")) return "AMOLED";
  if (/\bOLED\b|XDR OLED|P-?OLED/.test(v)) return "OLED";
  if (/\bIPS\b/.test(v)) return "IPS";
  if (/\bLCD\b|\bTFT\b|\bPLS\b/.test(v)) return "LCD";
  return null;
}

/** "Intel® Core™ i5-12450H Processor (8 core, ...)" -> "Intel Core i5-12450H"; "Helio G100 (6nm), Octa-core ..." -> "Helio G100". */
function chipsetName(value) {
  const name = String(value)
    .replace(/[®™©]|\((?:r|tm)\)/gi, "")
    .split(/[(,]/)[0]
    .replace(/\bprocessor\b.*$/i, "")
    .replace(/^\s*(\d+|octa|hexa|quad|deca|dual)[- ]?cores?\s+/i, "") // "6 Core Apple A18 Pro" -> "Apple A18 Pro"
    .replace(/\s+/g, " ")
    .trim();
  // A core count or a clock speed alone is not a chip: "Octa-Core", "6-core CPU" (Techroid's iPhone 17), "2.2GHz Octa core"; 227
  // sheets said no more than that (2026-11-10). A chip's name has a family word or letters with a number ("Helio G100", "A19").
  const isVague = (text) => /^((\d+|octa|hexa|quad|deca|dual|single)[- ]?cores?|\d+(\.\d+)?\s*ghz)\b/i.test(text) || /^\d+(\.\d+)?$/.test(text);
  const isNamed = (text) => /[a-z]{1,}\d|\d[a-z]|\b(apple|snapdragon|helio|dimensity|exynos|kirin|unisoc|tensor|bionic|core\s*(i\d|ultra)|ryzen)\b/i.test(text);
  // Two chips in one value is a page covering several variants, not this phone's chip ("MediaTek Helio G99 Ultimate / Dimensity
  // 7020" on a DigiMall page, shown on the Compare page; Fable, 2026-11-12). One chip with its clock or core count after a "/"
  // ("Intel Celeron N3450 / 1.1 GHz", "MediaTek Helio G81 / Octa-Core") is that chip.
  const parts = name.split(/\s+\/\s+/).map((part) => part.trim());
  const chips = parts.filter((part) => isNamed(part) && !isVague(part) && !/\bghz\b/i.test(part));
  if (chips.length !== 1 && parts.length > 1) return null;
  const chip = parts.length > 1 ? chips[0].replace(/\s+\d+(\.\d+)?$/, "") : name;
  return !isVague(chip) && isNamed(chip) && chip.length >= 2 ? chip.slice(0, 80) : null;
}

/** The tier of a phone, tablet or laptop chip; null when it is not one we know. */
export function chipsetTier(name) {
  const n = String(name).toLowerCase();
  // laptops and tablets
  if (/apple\s*m\d|core\s*(i9|ultra\s*9)|ryzen\s*9|\bultra\s*9\b/.test(n)) return "flagship";
  if (/core\s*(i7|ultra\s*7)|ryzen\s*7|\bultra\s*7\b|\bi7[- ]/.test(n)) return "upper-mid";
  if (/core\s*(i5|ultra\s*5)|ryzen\s*5|\bultra\s*5\b|\bi5[- ]/.test(n)) return "mid";
  if (/core\s*i3|ryzen\s*3|celeron|pentium|athlon|\bi3[- ]|intel\s*n\d{2,3}\b/.test(n)) return "entry";
  // phones
  if (/snapdragon\s*(8\s*(elite|gen\s*[1-9]|s?\+?\s*gen\s*\d)|888|865|870)/.test(n)) return "flagship";
  if (/dimensity\s*(9\d{3}|1\d{4})|apple\s*a(1[5-9]|[2-9]\d)|exynos\s*(2\d{3}|990)|tensor|kirin\s*9\d{3}/.test(n)) return "flagship";
  if (/snapdragon\s*(7\+?\s*(s\s*)?gen\s*\d|78\d|77\d)|dimensity\s*8\d{3}|exynos\s*1[4-5]\d{2}|apple\s*a1[2-4]/.test(n)) return "upper-mid";
  if (/snapdragon\s*(6\s*(s\s*)?gen\s*\d|69\d|68\d)|dimensity\s*7\d{3}|helio\s*g(8[5-9]|9\d|1\d\d)|exynos\s*1[23]\d{2}|exynos\s*8\d{2}/.test(n)) return "mid";
  if (/snapdragon\s*(4\s*(s\s*)?gen\s*\d|[34]\d{2})|dimensity\s*[6]\d{3}|dimensity\s*[5-7]\d{2}\b|helio\s*(g[0-7]\d|p\d{2}|a\d{2})|unisoc|spreadtrum|tiger\s*t\d/.test(n)) return "entry";
  return null;
}

/**
 * Each rule: the labels it reads (by meaning) and how it reads a value into fields. Rules are tried in order; a field is set by the
 * first label that gives it, so a store's dedicated row ("Refresh Rate") wins over a value that mentions it in passing.
 */
// An operating system's name, or "OS" ("DOS", "FreeDOS", "iOS26", "iPad OS", "Mac OSX", "Window 10 Home"), and not a chip's or an
// engine's ("Snapdragon 7s Gen 4 5G", "Exynos 7870 Octa", "M3 chip", "Tidal & Aurora Engine" were stored as one).
const OS_NAME = /(android|ios|ipad\s*os|watchos|wear\s*os|harmony|hyperos|miui|one\s*ui|color\s*os|funtouch|origin\s*os|\bxos\b|\bhios\b|realme\s*ui|oxygen|magic\s*os|nothing\s*os|\bwindows?\b|mac\s*os|\bosx\b|chrome\s*os|tizen|webos|linux|kai\s*os|dos\b|\bos\b)/i;
const NOT_AN_OS = /(snapdragon|exynos|dimensity|helio|kryo|tensor|bionic|\bchip\b|engine)/i;
const OPERATING_SYSTEM = { test: (value) => OS_NAME.test(value) && !NOT_AN_OS.test(value) };

const RULES = [
  { label: /^(chipset|processor|processor (name|type)|cpu|soc|platform)$/i, read: (v) => ({ chipset: chipsetName(v) }) },
  { label: /^(installed\s*)?ram(\s*memory)?$|^memory\s*\(ram\)$/i, read: (v) => ({ ramGb: singleCapacityGb(v) }) },
  {
    label: /^(internal\s*(memory|storage)|storage(\s*capacity)?|rom|built-?in storage|hard\s*drive\s*size|ssd|capacity)$/i,
    read: (v) => ({ storageGb: singleCapacityGb(v) }),
  },
  { label: /^refresh\s*rate$/i, read: (v) => ({ refreshHz: Math.max(...numbersBefore(v, "hz"), 0) || null }) },
  { label: /^(screen|display)\s*(size|surface)?$/i, read: (v) => ({ displayInches: inches(v, { bare: true }), displayType: displayType(v), refreshHz: Math.max(...numbersBefore(v, "hz"), 0) || null }) },
  { label: /^(screen|display|panel)\s*type$|^panel$/i, read: (v) => ({ displayType: displayType(v), refreshHz: Math.max(...numbersBefore(v, "hz"), 0) || null }) },
  {
    label: /battery|charging/i,
    read: (v) => ({
      batteryMah: Math.max(...numbersBefore(v, "mah"), 0) || null,
      chargingW: Math.max(...numbersBefore(v, "w").filter((w) => w >= 5 && w <= 300), 0) || null,
    }),
  },
  { label: /^(back|rear|main|primary)\s*cameras?(\s*pixel)?$/i, read: (v) => ({ mainCameraMp: Math.max(...numbersBefore(v, "mp|megapixels?"), 0) || (/^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null) }) },
  // A bare "Camera" is a phone's main camera, but on a laptop page it is the webcam ("2.0 MP Full HD (1080p) Webcam", Paklap): taken
  // only from 5 MP up.
  { label: /^cameras?$/i, read: (v) => ({ mainCameraMp: Math.max(...numbersBefore(v, "mp|megapixels?").filter((mp) => mp >= 5), 0) || null }) },
  { label: /^(front|selfie)\s*camera(\s*pixel)?$/i, read: (v) => ({ frontCameraMp: Math.max(...numbersBefore(v, "mp|megapixels?"), 0) || (/^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null) }) },
  // Only a value that names an operating system: a store's "OS" row once held "Snapdragon 7s Gen 4 5G" (Fable, 2026-11-12).
  { label: /^(operating\s*system|os)(\s*\(primary\))?$/i, read: (v) => ({ os: OPERATING_SYSTEM.test(String(v)) ? String(v).trim().slice(0, 80) : null }) },
  { label: /^5g$/i, read: (v) => ({ has5g: parseBool(v) }) },
  { label: /^network(\s*technology)?$/i, read: (v) => (/\b5g\b/i.test(v) ? { has5g: true } : {}) },
  { label: /^nfc$/i, read: (v) => ({ nfc: parseBool(v) }) },
  {
    label: /^(phone\s*|tablet\s*|laptop\s*)?weight$/i,
    read: (v) => {
      const kg = numbersBefore(v, "kg")[0];
      const g = numbersBefore(v, "g|grams?")[0];
      return { weightG: kg ? Math.round(kg * 1000) : g ?? null };
    },
  },
];

/**
 * Turn raw label/value pairs into a typed canonical spec sheet (may be sparse; empty when nothing is recognised).
 * @param {Record<string, string>} raw
 * @returns {Record<string, string|number|boolean>}
 */
export function normalizeSpecs(raw) {
  const sheet = {};
  for (const [label, value] of Object.entries(raw ?? {})) {
    if (isNotStated(value)) continue;
    const key = String(label).replace(/^[&\s]+/, "").trim();
    for (const rule of RULES) {
      if (!rule.label.test(key)) continue;
      for (const [field, parsed] of Object.entries(rule.read(value))) {
        if (parsed === null || parsed === undefined || Number.isNaN(parsed) || field in sheet) continue;
        sheet[field] = parsed;
      }
      break;
    }
  }
  if (sheet.chipset) {
    const tier = chipsetTier(sheet.chipset);
    if (tier) sheet.chipsetTier = tier;
  }
  return sheet;
}
