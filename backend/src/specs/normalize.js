/** Parse a float from a string like "8 GB", "5000 mAh", "6.7 inch", "120Hz". */
function parseFloat_(s) {
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

/** Parse a boolean from "Yes"/"No"/"true"/"false"/etc. Returns null if unrecognizable. */
function parseBool(s) {
  const v = String(s).trim().toLowerCase();
  if (["yes", "true", "1", "supported", "available"].includes(v)) return true;
  if (["no", "false", "0", "not supported", "unavailable", "n/a"].includes(v)) return false;
  return null;
}

/** Extract camera MP from "50 MP + 12 MP + 10 MP" → 50 (take first/largest). */
function parseCameraMp(s) {
  const nums = String(s).match(/[\d.]+/g)?.map(Number) ?? [];
  return nums.length > 0 ? Math.max(...nums) : NaN;
}

/** Classify chipset string into tier. */
function chipsetTier(name) {
  const n = name.toLowerCase();
  // Flagship
  if (/snapdragon\s*(8\s*(gen\s*[123]|[+]\s*gen\s*1)|888|865|870)/.test(n)) return "flagship";
  if (/dimensity\s*(9[0-9]{3}|1[0-9]{4})/.test(n)) return "flagship";
  if (/apple\s*(a1[5-9]|a[2-9]\d)/.test(n)) return "flagship";
  if (/exynos\s*(2[0-9]{3}|990|980)/.test(n)) return "flagship";
  if (/kirin\s*(9[0-9]{3}|1[0-9]{4})/.test(n)) return "flagship";
  // Upper-mid
  if (/snapdragon\s*(7[+]\s*gen\s*[23]|7\s*gen\s*[123]|780|778|76[0-9])/.test(n)) return "upper-mid";
  if (/dimensity\s*(8[0-9]{3})/.test(n)) return "upper-mid";
  if (/exynos\s*(1[0-2][0-9]{2})/.test(n)) return "upper-mid";
  // Mid
  if (/snapdragon\s*(6\s*gen|695|690|68[0-9]|67[0-9])/.test(n)) return "mid";
  if (/dimensity\s*(7[0-9]{3})/.test(n)) return "mid";
  if (/helio\s*g(9[0-9]|8[5-9])/.test(n)) return "mid";
  if (/exynos\s*(8[5-9][0-9])/.test(n)) return "mid";
  // Entry
  if (/snapdragon\s*(4\s*gen|4[0-9]{2}|[34][0-9]{2})/.test(n)) return "entry";
  if (/dimensity\s*(7[0-2][0-9]|[5-6][0-9]{2})/.test(n)) return "entry";
  if (/helio\s*(g[0-7][0-9]|p[0-9]{2}|a[0-9]{2})/.test(n)) return "entry";
  if (/unisoc|spreadtrum/.test(n)) return "entry";
  return null; // unknown
}

/** Normalize a display type string. */
function normalizeDisplayType(s) {
  const v = s.toUpperCase();
  if (v.includes("AMOLED") || v.includes("SUPER AMOLED")) return "AMOLED";
  if (v.includes("OLED")) return "OLED";
  if (v.includes("IPS")) return "IPS";
  if (v.includes("LCD") || v.includes("TFT") || v.includes("PLS")) return "LCD";
  return null;
}

/**
 * Raw field name patterns → canonical field extractor.
 * Each entry: [pattern to match the raw key, function to parse the raw value].
 */
const FIELD_PARSERS = [
  [/^(chipset|processor|cpu|soc|processor name)$/i,   (v) => ({ chipset: v.trim().slice(0, 80) || null })],
  [/^ram(\s*memory)?$|^memory$/i,                     (v) => ({ ramGb: parseFloat_(v) || null })],
  [/^(internal\s*)?storage$|^rom$|^built-in storage$/i, (v) => ({ storageGb: parseFloat_(v) || null })],
  [/^display\s*(size|screen)?$|^screen\s*size$/i,      (v) => ({ displayInches: parseFloat_(v) || null })],
  [/^refresh\s*rate$/i,                               (v) => ({ refreshHz: parseFloat_(v) || null })],
  [/^display\s*type$|^screen\s*type$|^panel(\s*type)?$/i, (v) => ({ displayType: normalizeDisplayType(v) })],
  [/^battery(\s*capacity)?$|^battery\s*life$/i,       (v) => ({ batteryMah: parseFloat_(v) || null })],
  [/^charging(\s*speed)?$|^fast\s*charg/i,            (v) => ({ chargingW: parseFloat_(v) || null })],
  [/^(main|rear|back|primary)?\s*camera$/i,            (v) => ({ mainCameraMp: parseCameraMp(v) || null })],
  [/^(front|selfie|secondary)\s*camera$/i,             (v) => ({ frontCameraMp: parseCameraMp(v) || null })],
  [/^(operating\s*)?system$|^android(\s*version)?$|^ios$/i, (v) => ({ os: v.trim().slice(0, 80) || null })],
  [/^5g$|^network\s*technology$/i,                    (v) => ({ has5g: parseBool(v) })],
  [/^nfc$/i,                                          (v) => ({ nfc: parseBool(v) })],
  [/^weight(\s*(grams?|g))?$/i,                       (v) => ({ weightG: parseFloat_(v) || null })],
];

/**
 * Turn raw label/value pairs into a typed canonical spec sheet.
 * Fields outside the canonical set are dropped. Returns the sheet (may be sparse).
 *
 * @param {Record<string, string>} raw
 * @returns {Record<string, string|number|boolean>}
 */
export function normalizeSpecs(raw) {
  const sheet = {};
  for (const [key, val] of Object.entries(raw)) {
    for (const [pattern, parse] of FIELD_PARSERS) {
      if (pattern.test(key)) {
        const result = parse(val);
        for (const [field, value] of Object.entries(result)) {
          if (value !== null && value !== undefined && !Number.isNaN(value)) {
            sheet[field] = value;
          }
        }
        break;
      }
    }
  }
  // Derive chipsetTier from chipset if present
  if (sheet.chipset && !sheet.chipsetTier) {
    const tier = chipsetTier(sheet.chipset);
    if (tier) sheet.chipsetTier = tier;
  }
  return sheet;
}