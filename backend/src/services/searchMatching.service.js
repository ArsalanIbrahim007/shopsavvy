// searchMatching.service.js — progressively looser matching strategies for
// search queries that the exact-substring regex in search.controller.js
// misses: no space between a word and a number ("iphone17"), and outright
// typos ("ipohne"). Each strategy is tried only when the one before it
// found nothing, so a clean, well-formed query still takes the cheapest,
// most precise path -- these are fallbacks, not a replacement.

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
export function escapeRegex(value) {
  return value.replace(REGEX_SPECIAL, "\\$&");
}

/**
 * Builds a title regex pattern tolerant of a missing space at a letter<->
 * digit boundary, in either direction: "iphone17" should still find
 * "iPhone 17", and a title occasionally written "iphone17" (no space)
 * should still be found by "iphone 17". Every other character is matched
 * literally (escaped first), so this doesn't loosen the match in any other
 * way.
 *
 * @returns {string} a regex source string, not a compiled RegExp
 */
export function buildSpaceTolerantPattern(query) {
  const escaped = escapeRegex(query.trim());
  return escaped.replace(/([a-zA-Z])(\d)/g, "$1\\s*$2").replace(/(\d)([a-zA-Z])/g, "$1\\s*$2");
}

/**
 * buildSpaceTolerantPattern, as whole words: no letter or digit right before or after it. "s23" found a Dawlance "DWGS 2316"
 * garment steamer ("S 23" inside "DWGS 2316") among the Galaxy S23s (2026-11-07). For search; suggestions keep matching word
 * beginnings ("galax").
 */
export function buildWholeWordPattern(query) {
  return `(?<![A-Za-z0-9])${buildSpaceTolerantPattern(query)}(?![A-Za-z0-9])`;
}

/**
 * Words that name a category rather than appear in product titles: a phone's title says "Samsung Galaxy A17", never "phone", so
 * "samsung phone" found nothing after asking every store (34 s, audit 2026-11-18; we hold 1,671 Samsung Galaxy phones). Such a word
 * sets the category and is not matched against titles.
 */
export const CATEGORY_WORDS = new Map([
  ...["phone", "phones", "mobile", "mobiles", "smartphone", "smartphones", "cellphone"].map((w) => [w, "smartphone"]),
  ...["fridge", "fridges", "refrigerator", "refrigerators"].map((w) => [w, "refrigerator"]),
  ...["ac", "acs", "aircon", "airconditioner"].map((w) => [w, "air_conditioner"]),
  ...["washer", "washers", "washing"].map((w) => [w, "washing_machine"]),
  ...["tv", "tvs", "television", "televisions"].map((w) => [w, "tv"]),
  ...["laptop", "laptops", "notebook", "notebooks"].map((w) => [w, "laptop"]),
  ...["smartwatch", "smartwatches"].map((w) => [w, "smartwatch"]),
  ...["earbuds", "earphones", "headphones", "headset", "headsets"].map((w) => [w, "headphones"]),
  ...["tablet", "tablets"].map((w) => [w, "tablet"]),
  ...["monitor", "monitors"].map((w) => [w, "monitor"]),
]);
// "machine" goes with "washing"; "air" and "conditioner" are ordinary title words and stay.
const WITH_CATEGORY_WORD = new Set(["machine", "machines"]);

/**
 * Splits a search's words into the ones to match in titles and the category its category words name (or null). A search made only
 * of category words keeps them ("phone" alone is still a search for the word).
 * @returns {{ words: string[], category: string|null }}
 */
export function splitCategoryWords(words) {
  const named = words.map((w) => CATEGORY_WORDS.get(w.toLowerCase())).filter(Boolean);
  const category = new Set(named).size === 1 ? named[0] : null;
  if (!category) return { words, category: null };
  const rest = words.filter((w) => !CATEGORY_WORDS.has(w.toLowerCase()) && !(category === "washing_machine" && WITH_CATEGORY_WORD.has(w.toLowerCase())));
  return rest.length ? { words: rest, category } : { words, category: null };
}

/**
 * A word as a pattern that also matches it split by a space or hyphen anywhere: "galaxytab" finds "Galaxy Tab", "sonywh1000xm4"
 * finds "Sony WH-1000XM4", "thinkpadx1" finds "ThinkPad X1" (audit 2026-11-18: each found nothing).
 */
export function joinedWordPattern(word) {
  const chars = [...String(word).toLowerCase()].map((c) => escapeRegex(c));
  return `(?<![A-Za-z0-9])${chars.join("[\\s-]?")}(?![A-Za-z0-9])`;
}

/**
 * A screen size followed by a model code ("55u8000f", "65q7f", "55c6k"): its size and the code apart, or null. Stores write the same
 * TV "55U8000F", "U8000F" (with 55" elsewhere) or "UA55U8000FUSMM", and a search for "Samsung 55U8000F" found two stores of
 * five (audit S-006, 2026-11-18).
 */
export function sizedModelCode(word) {
  const match = String(word).toLowerCase().match(/^(\d{2,3})([a-z]{1,3}\d{1,5}[a-z]{0,3})$/);
  return match && Number(match[1]) >= 24 && Number(match[1]) <= 115 ? { size: Number(match[1]), code: match[2] } : null;
}

/** The pattern for a search word: the word as a whole word (a plural allowed), or for a sized model code also its other spellings. */
// A model word and its number, glued, spaced or hyphenated alike: "gt5", "gt 5" (modelNumberWords) and "gt-5" all find "GT 5", "GT5"
// and "GT-5" (2026-11-26: "HUAWEI GT 5 Pro" did not find "Huawei Watch GT5 Pro 46mm"). Only a letter before a short number.
const looseNumber = (escaped) => escaped.replace(/([a-z]) (?=\d)/gi, "$1[\\s-]?").replace(/(^|[^a-z])([a-z]{2,})(?=\d{1,2}$)/gi, "$1$2[\\s-]?");

// A brand's short name, as stores write it out: "mi band 9" found nothing after asking every store for 25 s, though 17 "Xiaomi Smart
// Band 9" listings were stored (audit A-05, 2026-11-26).
const BRAND_ALIASES = new Map([["mi", ["mi", "xiaomi"]]]);

export function searchWordPattern(word) {
  const aliases = BRAND_ALIASES.get(String(word).toLowerCase());
  if (aliases) return `(?<![A-Za-z0-9])(?:${aliases.map(escapeRegex).join("|")})(?![A-Za-z0-9])`;
  const sized = sizedModelCode(word);
  if (!sized) return `(?<![A-Za-z0-9])${looseNumber(escapeRegex(word))}(?:e?s)?(?![A-Za-z0-9])`;
  return `(?<![A-Za-z0-9])(?:[a-z]{0,2}${sized.size})?${escapeRegex(sized.code)}[a-z]{0,4}(?![A-Za-z0-9])`;
}

/**
 * A search's words, with a model's one-digit number kept on the word before it: ["huawei", "gt 5", "pro"] for "HUAWEI GT 5 Pro".
 * Words shorter than two characters were dropped, so "GT 5 Pro" was searched as "GT Pro" and found the GT 2, 5, 6 and 7 Pro alike
 * (2026-11-26). The number goes with a word of letters that is not a brand ("Haier 1 Ton" keeps dropping its "1": the 1 is the
 * tonnage, and the title may put the model code between them) nor a unit; other one-character words are dropped as before.
 */
const LINE_BRANDS = new Set(["pixel", "iphone", "ipad", "galaxy", "redmi", "poco", "macbook"]);
export function modelNumberWords(tokens, isBrand = () => false) {
  const out = [];
  tokens.forEach((token, i) => {
    const before = tokens[i - 1];
    const after = String(tokens[i + 1] ?? "").toLowerCase();
    const unitAfter = /^(tons?|kg|kgs|ltrs?|l|inch|in|gb|tb|mm|hp|w|pcs|pack|year|years)$/.test(after) || /^\d/.test(after);
    // After a brand only when the number ends the search or a word follows it ("Pixel 9 Pro": "pixel" reads as Google's brand, and
    // the 9 was dropped, so a used Pixel 8 Pro came up, audit 2026-11-26); "Haier 1 Ton" and "Haier 1.5 ton" still drop it.
    // Only a brand word that is itself a product line ("samsung 5 star" is an energy rating).
    const brandOk = Boolean(before) && (!isBrand(before) || (LINE_BRANDS.has(before.toLowerCase()) && /^[a-z]*$/i.test(after)));
    if (/^\d$/.test(token) && out.length && before && /^[a-z]{2,}$/i.test(before) && brandOk && !unitAfter) {
      out[out.length - 1] = `${out[out.length - 1]} ${token}`;
    } else if (token.length >= 2) out.push(token);
  });
  return out;
}

/** True when `short` (3 letters) is `long` with one letter left out ("gre" for "gree", "del" for "dell"). */
function missesOneLetter(short, long) {
  if (long.length !== short.length + 1) return false;
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  return false;
}

/** True when `a` and `b` differ by two neighbouring letters swapped ("ari" for "air"). */
function swapsTwoLetters(a, b) {
  if (a.length !== b.length || a === b) return false;
  const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Classic edit distance (insertions, deletions, substitutions), iterative
 * with a rolling two-row table rather than a full matrix -- these strings
 * are short (product-title tokens), so this is O(n*m) time and O(min(n,m))
 * space, plenty fast for a few thousand comparisons.
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow.push(
        Math.min(
          previousRow[j + 1] + 1, // deletion
          currentRow[j] + 1, // insertion
          previousRow[j] + cost // substitution
        )
      );
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/**
 * Edit distance in which swapping two neighbouring letters is one typo ("iphnoe" -> "iphone"), not two (optimal string
 * alignment). Typos are what this fallback is for, and a swap is the commonest.
 */
export function typoDistance(a, b) {
  if (a === b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// How many typos a word may carry and still be the word: none up to 3 letters ("gun", "tv", "hp"), 1 up to 6 ("walls" ->
// "wall"), 2 from 7 ("geasyer" -> "geyser"). It allowed up to 30% of the word (3 typos in "mosquito") and needed only 60% of a
// search's words to match, so "mosquito" found AirPods and "electric geasyer" found phones, TVs and air conditioners (2026-11-07).
function maxAllowedDistance(word) {
  if (word.length <= 3) return 0;
  return word.length <= 6 ? 1 : 2;
}

/**
 * Fraction of the query's tokens that have a title token within a typo-
 * scale edit distance -- not an average distance, because one query word
 * matching perfectly shouldn't compensate for another matching nothing at
 * all ("iphone" matching exactly doesn't make "smasung" an acceptable
 * stand-in for an unrelated word elsewhere in the title).
 *
 * @returns {number} 0..1
 */
export function fuzzyTokenScore(query, title) {
  const queryTokens = tokenize(query);
  const titleTokens = tokenize(title);
  if (queryTokens.length === 0 || titleTokens.length === 0) return 0;

  let matched = 0;
  for (const queryToken of queryTokens) {
    // Edit distance is a reasonable typo model for letters, but not for
    // digits: "17" is one edit away from "7", "11", "12", "13" ... "19",
    // and those aren't typos of each other, they're different model
    // generations or capacities. A purely numeric token has to match
    // exactly, or it isn't allowed to drag in every nearby number.
    // A model code with digits is the same: "65u8k" is a Hisense model, "65p8k" a TCL one (2026-11-07).
    const isNumeric = /\d/.test(queryToken);
    const hasCloseMatch = isNumeric
      ? titleTokens.includes(queryToken)
      : titleTokens.some((titleToken) => {
          // A 3-letter word may miss one letter or swap two ("gre" Gree, "del" Dell, "ari" Air; audit 2026-11-18), never change one:
          // "gun" is not "sun".
          if (queryToken.length === 3 && (missesOneLetter(queryToken, titleToken) || swapsTwoLetters(queryToken, titleToken))) return true;
          const allowed = maxAllowedDistance(queryToken);
          return Math.abs(titleToken.length - queryToken.length) <= allowed
            && typoDistance(queryToken, titleToken) <= allowed;
        });
    if (hasCloseMatch) matched++;
  }

  return matched / queryTokens.length;
}

// Every word of the search has to be in the title, spelt nearly right: "pressure washer gun" matched a water dispenser on two words
// of three. A title that misses a word the shopper typed is not what they asked for.
const FUZZY_MATCH_THRESHOLD = 1;

/**
 * Fuzzy-matches a query against a candidate list, returning only the ids
 * of candidates that clear the threshold. Meant to run over a bounded
 * candidate set (see search.controller.js) as a last-resort fallback, not
 * as the primary search path -- it's an in-memory scan, not an index
 * lookup.
 *
 * @param {string} query
 * @param {{_id: any, title: string}[]} candidates
 * @returns {any[]} matching ids, in descending score order
 */
export function fuzzyMatchIds(query, candidates) {
  return candidates
    .map((c) => ({ id: c._id, score: fuzzyTokenScore(query, c.title) }))
    .filter((c) => c.score >= FUZZY_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.id);
}
