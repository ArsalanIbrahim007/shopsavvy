import {
  extractStorage,
  modelTokens,
  extractScreenInches,
  extractPtaStatus,
  extractModelCodes,
} from "./normalizeTitle.service.js";
import { extractRamGb } from "./productAttributes.service.js";

/**
 * Words marking a distinct product tier rather than describing the same
 * device. "Pro" and "Pro Max" are different phones.
 */
const VARIANT_TOKENS = new Set([
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

function sameSet(a, b) {
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
 *
 * Where only one listing declares the attribute the comparison falls through
 * to the model name, since that listing is simply less specific.
 */
function attributeConflict(textA, textB) {
  // Two listings that both omit capacity and approval status cannot be
  // confirmed equivalent either. Silence on both sides is not agreement.
  if (extractStorage(textA) === null && extractStorage(textB) === null &&
      extractPtaStatus(textA) === "unknown" && extractPtaStatus(textB) === "unknown") {
    return true;
  }
 // Storage and network approval must be positively confirmed as equal. If one
  // listing declares the attribute and the other is silent, equivalence is
  // unproven, so the two are not compared. Assuming the silent listing matches
  // produced comparisons such as a bare "iPhone 16 Pro Max" against a "256GB
  // PTA Approved" unit at a difference of PKR 140,000.
  const storageA = extractStorage(textA);
  const storageB = extractStorage(textB);
  if (storageA !== storageB) return true;
// Memory is stated alongside storage on some stores, as in
  // "(12GB RAM + 256GB Storage)". Both variants share a storage capacity, so
  // without this check an 8GB and a 12GB unit are treated as one product.
  const ramA = extractRamGb(textA);
  const ramB = extractRamGb(textB);
  if (ramA !== null && ramB !== null && ramA !== ramB) return true;
  const screenA = extractScreenInches(textA);
  const screenB = extractScreenInches(textB);
  if (screenA !== null && screenB !== null && screenA !== screenB) return true;

  // Network approval changes the usable value of a handset in Pakistan, so an
  // approved and a non approved unit must never compete on price.
  const ptaA = extractPtaStatus(textA);
  const ptaB = extractPtaStatus(textB);
// Approval status blocks a match only when both listings state it. Most
  // stores are silent on the point, and treating silence as a conflict split
  // the same handset across every platform that did not mention it.
  if (ptaA !== "unknown" && ptaB !== "unknown" && ptaA !== ptaB) return true;

  const codesA = extractModelCodes(textA);
  const codesB = extractModelCodes(textB);
  if (codesA.size > 0 && codesB.size > 0 && !sameSet(codesA, codesB)) return true;

  if (!sameSet(extractVariants(textA), extractVariants(textB))) return true;

  return false;
}

export function isSimilarProduct(textA = "", textB = "", threshold = 0.7) {
  if (attributeConflict(textA, textB)) return false;

  const baseA = tokenize(modelTokens(textA)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");
  const baseB = tokenize(modelTokens(textB)).filter((t) => !VARIANT_TOKENS.has(t)).join(" ");

  return calculateJaccardSimilarity(baseA, baseB) >= threshold;
}