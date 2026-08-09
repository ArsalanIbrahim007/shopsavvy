import { extractStorage, modelTokens } from "./normalizeTitle.service.js";

/**
 * Words that mark a distinct product tier rather than describing the same
 * device. "Pro" and "Pro Max" are different phones, so these are compared as
 * an exact set rather than being diluted across a token-similarity score.
 */
const VARIANT_TOKENS = new Set([
  "pro", "max", "plus", "ultra", "mini", "air", "fe", "lite", "se",
]);

export function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function calculateJaccardSimilarity(textA = "", textB = "") {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((token) => tokensB.has(token)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

export function getSimilarityPercentage(textA = "", textB = "") {
  return Math.round(calculateJaccardSimilarity(textA, textB) * 100);
}

export function extractVariants(text = "") {
  return new Set(tokenize(modelTokens(text)).filter((token) => VARIANT_TOKENS.has(token)));
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Decides whether two listings describe the same product.
 *
 * Two attributes are treated as decisive rather than as ordinary tokens:
 * storage capacity, and tier words such as Pro, Max and Ultra. Both are single
 * tokens in a long title, so token similarity alone cannot separate a 256GB
 * from a 1TB, or a Pro from a Pro Max. Everything else is compared on the
 * remaining model name.
 *
 * Where only one title states a capacity, the comparison falls through to the
 * model name — that listing is simply less specific, not a different product.
 */
export function isSimilarProduct(textA = "", textB = "", threshold = 0.7) {
  const storageA = extractStorage(textA);
  const storageB = extractStorage(textB);

  if (storageA !== null && storageB !== null && storageA !== storageB) {
    return false;
  }

  if (!sameSet(extractVariants(textA), extractVariants(textB))) {
    return false;
  }

  const baseA = tokenize(modelTokens(textA)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");
  const baseB = tokenize(modelTokens(textB)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");

  return calculateJaccardSimilarity(baseA, baseB) >= threshold;
  
}