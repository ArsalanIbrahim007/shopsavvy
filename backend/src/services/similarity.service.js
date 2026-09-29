import {
  extractStorage,
  modelTokens,
  extractScreenInches,
  extractPtaStatus,
  extractModelCodes,
  extractSpecs,
} from "./normalizeTitle.service.js";
import { extractRamGb, extractCondition } from "./productAttributes.service.js";

/**
 * Words marking a distinct product tier rather than describing the same
 * device. "Pro" and "Pro Max" are different phones.
 */
export const VARIANT_TOKENS = new Set([
  "pro", "max", "plus", "ultra", "mini", "air", "fe", "lite", "se",
]);

export function tokenize(text = "") {
  return String(text).toLowerCase().split(" ").map((t) => t.trim()).filter(Boolean);
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

export function extractVariants(text = "") {
  return new Set(tokenize(modelTokens(text)).filter((t) => VARIANT_TOKENS.has(t)));
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
export function seriesNumbers(text = "") {
  const tokens = tokenize(modelTokens(text));
  const found = new Set();
  tokens.forEach((token, i) => {
    if (/^\d{1,2}$/.test(token) && !NON_MODEL_NUMBER_PRECEDERS.has(tokens[i - 1])) found.add(token);
  });
  return found;
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

  // Model codes conflict only when both titles state some and they share
  // none. Requiring identical sets split a store that appends a SKU ("S24
  // Ultra (SM-S928B)") from one that doesn't ("S24 Ultra") once short codes
  // like "s24" count; the same one-sided extra is not evidence of a
  // different product.
  const codesA = extractModelCodes(textA);
  const codesB = extractModelCodes(textB);
  if (
    codesA.size > 0 &&
    codesB.size > 0 &&
    ![...codesA].some((a) => [...codesB].some((b) => sameModelCode(a, b)))
  ) return true;

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