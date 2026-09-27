// searchMatching.service.js — progressively looser matching strategies for
// search queries that the exact-substring regex in listing.controller.js
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

// Short words ("hp", "tv") tolerate at most 1 typo'd character; longer
// words scale allowance with length so "smartphone" can absorb more than
// one slip without becoming meaninglessly permissive.
function maxAllowedDistance(word) {
  return word.length <= 4 ? 1 : Math.ceil(word.length * 0.3);
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
    const isNumeric = /^\d+$/.test(queryToken);
    const hasCloseMatch = isNumeric
      ? titleTokens.includes(queryToken)
      : titleTokens.some((titleToken) => {
          const allowed = maxAllowedDistance(queryToken);
          return Math.abs(titleToken.length - queryToken.length) <= allowed
            && levenshteinDistance(queryToken, titleToken) <= allowed;
        });
    if (hasCloseMatch) matched++;
  }

  return matched / queryTokens.length;
}

const FUZZY_MATCH_THRESHOLD = 0.6;

/**
 * Fuzzy-matches a query against a candidate list, returning only the ids
 * of candidates that clear the threshold. Meant to run over a bounded
 * candidate set (see listing.controller.js) as a last-resort fallback, not
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
