/**
 * Reduces platform-specific product titles to a comparable form.
 *
 * Storage capacity is normalised to a single token (128gb, 1tb) because it
 * distinguishes genuinely different products and is written inconsistently
 * across stores.
 */
export function normalizeTitle(title = "") {
  return String(title)
    .toLowerCase()

    // Strip any HTML that leaked through the scraper
    .replace(/<[^<>]*>/g, " ")

    // Brand words that appear inconsistently
    .replace(/\bapple\b/g, "")

    // Marketing and compliance terms
    .replace(/\bpta approved\b/g, "")
    .replace(/\bnon pta\b/g, "")
    .replace(/\bpta\b/g, "")
    .replace(/\bofficial warranty\b/g, "")
    .replace(/\bofficial\b/g, "")
    .replace(/\bwarranty\b/g, "")
    .replace(/\bbrand new\b/g, "")
    .replace(/\bnew\b/g, "")
    .replace(/\bstorage\b/g, "")
    .replace(/\bsingle sim\b/g, "")
    .replace(/\bdual sim\b/g, "")

    // Collapse "128 gb" / "1 tb" onto a single token
    .replace(/\b(\d+)\s*gb\b/g, "$1gb")
    .replace(/\b(\d+)\s*tb\b/g, "$1tb")

    .replace(/\bgeneration\b/g, "gen")
    .replace(/\bintel\b/g, "")
    .replace(/\b5g\b/g, "")

    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the storage capacity token, normalised to gigabytes so that
 * "1tb" and "1024gb" compare equal. Returns null when the title does not
 * state a capacity.
 *
 * RAM is written as "8gb 256gb" on some stores, so when two capacities are
 * present the larger is taken as storage.
 */
export function extractStorage(title = "") {
  const normalized = normalizeTitle(title);
  const capacities = [];

  for (const match of normalized.matchAll(/\b(\d+)(gb|tb)\b/g)) {
    const value = Number(match[1]);
    capacities.push(match[2] === "tb" ? value * 1024 : value);
  }

  if (capacities.length === 0) return null;

  return Math.max(...capacities);
}

/**
 * Title tokens with capacity removed, used for model-level comparison.
 */
export function modelTokens(title = "") {
  return normalizeTitle(title)
    .replace(/\b\d+(gb|tb)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/**
 * Screen size in inches. Decisive for televisions, monitors and laptops in the
 * same way storage capacity is decisive for phones: a 65 inch and an 85 inch
 * television are different products however similar their titles read.
 */
export function extractScreenInches(title = "") {
  const match = String(title).toLowerCase()
    .match(/\b(\d{2}(?:\.\d)?)\s*(?:inch|inches|"|\u201d|\u2033)/);

  if (!match) return null;

  const value = Number(match[1]);
  return value >= 10 && value <= 120 ? value : null;
}

/**
 * PTA approval status, specific to the Pakistani market. A non approved
 * handset cannot use local cellular networks without a substantial tax
 * payment, so it is consistently cheaper than the approved unit. Comparing the
 * two on price alone is misleading, because the non approved offer wins on a
 * difference the buyer has not accounted for.
 */
export function extractPtaStatus(title = "") {
  const text = String(title).toLowerCase();

  if (/\bnon[\s-]?pta\b/.test(text)) return "non_pta";
  if (/\bpta\b/.test(text)) return "pta_approved";
  return "unknown";
}

/*
 * Title tokens that mix letters and digits fall into two kinds, and treating
 * them alike was a real matching bug (found 2026-09-29):
 *
 *   - Model codes (QN70F, L320, S2721DGF) name *this product*. Two titles
 *     sharing one is strong evidence they are the same product.
 *   - Specifications (40mm, 144hz, 5000mah, 13th gen, a 13620h CPU, an RTX
 *     4060 GPU, a Core i7) describe a property that *many different
 *     products* share. Two different watches can both be 44mm; an IdeaPad and
 *     a ThinkPad can both have a 155H CPU.
 *
 * When specs were counted as model codes, two failures followed: a store
 * listing one extra spec made the code sets differ and vetoed a genuine
 * match (the same Galaxy Watch 8 from iShopping and PriceOye never grouped),
 * and a shared spec looked like a shared model code, so the trained
 * classifier merged different products (Galaxy Watch 7/8/9, all 44mm, as
 * one group; an HP ProBook with a Lenovo ThinkPad, both "13th gen").
 *
 * So specs are pulled out and compared as constraints -- when both titles
 * state one, they must agree -- and only what is left counts as a model code.
 */

// Number + unit. "p" is resolution only for real resolutions, because Intel
// CPUs also end in P (i7-1260P).
const UNIT_TOKEN = /^(\d+)(mm|cm|khz|ghz|hz|mah|wh|mp|kw|w|inches|inch|in|th|st|nd|rd|nits|fps)$/;
const UNIT_KEY = { inches: "inch", in: "inch", th: "gen", st: "gen", nd: "gen", rd: "gen" };
const RESOLUTION_TOKEN = /^(480|720|1080|1440|2160)p$/;

// Laptop/desktop CPU model numbers: 1334u, 13620h, 1135g7, 7735hs, 258v, 12400f.
const CPU_TOKEN = /^\d{3,5}(u|h|hs|hx|g\d|v|k|kf|f|x|p)$/;

// GPU and CPU-tier are two-token phrases after normalisation: "rtx 4060",
// "core i7" -> "i7", "ultra 7", "ryzen 5".
const GPU_PREFIX = new Set(["rtx", "gtx", "rx", "mx", "arc"]);
const CPU_TIER_TOKEN = /^c?i[3579]$/;
const CPU_TIER_PREFIX = new Set(["core", "ultra", "ryzen"]);

function classifyTitleTokens(title, { minCodeLength = 3 } = {}) {
  const codePattern = new RegExp(`^(?=.*[a-z])(?=.*\\d)[a-z0-9]{${minCodeLength},}$`);
  const tokens = normalizeTitle(title).split(" ").filter(Boolean);
  const specs = new Map();
  const codes = new Set();
  const consumed = new Set();

  const addSpec = (key, value) => {
    if (!specs.has(key)) specs.set(key, new Set());
    specs.get(key).add(value);
  };

  tokens.forEach((token, i) => {
    const next = tokens[i + 1];
    let m;

    if ((m = token.match(UNIT_TOKEN))) {
      addSpec(UNIT_KEY[m[2]] || m[2], Number(m[1]));
    } else if (RESOLUTION_TOKEN.test(token)) {
      addSpec("resolution", token);
    } else if (CPU_TOKEN.test(token)) {
      addSpec("cpu", token);
    } else if (CPU_TIER_TOKEN.test(token)) {
      addSpec("cputier", token.replace(/^c/, "").slice(1)); // "ci7"/"i7" -> "7"
    } else if (CPU_TIER_PREFIX.has(token) && /^[3579]$/.test(next ?? "")) {
      addSpec("cputier", next); // "ultra 7", "core 5", "ryzen 7"
      consumed.add(i + 1);
    } else if (GPU_PREFIX.has(token) && /^\d{3,4}$/.test(next ?? "")) {
      addSpec("gpu", `${token}${next}`);
      consumed.add(i + 1);
    } else if (!consumed.has(i) && !/^\d+(gb|tb|mb)$/.test(token) && codePattern.test(token)) {
      // Capacities are handled separately and are not model codes either.
      codes.add(token);
    }
  });

  return { codes, specs };
}

/**
 * Manufacturer model codes such as QN70F, S85F or FA2787NR. These mix letters
 * and digits and are frequently the only token distinguishing two otherwise
 * identically described products, so they cannot be left to compete with every
 * other word in a similarity score. Specifications are excluded -- see above.
 *
 * Three characters is enough for a code (Samsung TV "Q7F", ThinkPad "E14",
 * Galaxy "S24", Huawei "GT5"); four missed all of those. The trained
 * classifier's feature keeps { minCodeLength: 4 }, the definition it was
 * trained on -- see ml/features.js.
 */
export function extractModelCodes(title = "", opts) {
  return classifyTitleTokens(title, opts).codes;
}

/**
 * Specifications stated in a title, by kind: e.g. "Samsung Watch 8 44mm" ->
 * { mm: {44} }, "Core i7 13th Gen" -> { cputier: {"7"}, gen: {13} }. A title
 * can state several values for one kind ("50MP + 12MP" cameras), hence sets.
 *
 * @returns {Map<string, Set<number|string>>}
 */
export function extractSpecs(title = "") {
  return classifyTitleTokens(title).specs;
}