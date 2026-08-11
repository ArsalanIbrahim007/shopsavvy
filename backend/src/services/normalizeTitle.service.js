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
    .replace(/<[^>]*>/g, " ")

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

/**
 * Manufacturer model codes such as QN70F, S85F or FA2787NR. These mix letters
 * and digits and are frequently the only token distinguishing two otherwise
 * identically described products, so they cannot be left to compete with every
 * other word in a similarity score.
 */
export function extractModelCodes(title = "") {
  const codes = new Set();

  normalizeTitle(title).split(" ").forEach((token) => {
   // Capacities are handled separately and must not be read as model codes.
    if (/^\d+(gb|tb|mb)$/.test(token)) return;
    if (/^(?=.*[a-z])(?=.*\d)[a-z0-9]{4,}$/.test(token)) codes.add(token);
  });

  return codes;
}