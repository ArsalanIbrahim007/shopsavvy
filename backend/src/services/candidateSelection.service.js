import { modelTokens } from "./normalizeTitle.service.js";
import { tokenize } from "./similarity.service.js";

// Deliberately looser than the matcher's own threshold (0.7 for the rule, a
// learned boundary for the classifier): this only discards listings that are
// clearly a different product so grouping runs on dozens of titles rather
// than the whole category. The matcher still makes the real decision.
export const CANDIDATE_MIN_SIMILARITY = 0.3;

// Jaccard alone drops a store whose title is padded with marketing text
// ("... 7200 mAh BlueVolt Battery - OriginOS 6.0 New System ..."): the padding
// inflates the union. The overlap coefficient asks instead how much of the
// shorter title appears in the longer one, which padding does not dilute.
export const CANDIDATE_MIN_OVERLAP = 0.6;
const MIN_TOKENS_FOR_OVERLAP = 2;

function overlapScores(tokensA, tokensB) {
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  const union = tokensA.size + tokensB.size - shared;
  const smaller = Math.min(tokensA.size, tokensB.size);
  return {
    jaccard: union ? shared / union : 0,
    overlap: smaller >= MIN_TOKENS_FOR_OVERLAP ? shared / smaller : 0,
  };
}
export const CANDIDATE_CAP = 300;

/**
 * Narrows a pool of same-category listings to those that could plausibly be
 * the same product as `listing`, always including `listing` itself. When more
 * than `cap` qualify the most similar are kept. The result is ordered by price,
 * ascending, because greedy grouping picks each group's first member as its
 * representative and the old query returned that order.
 *
 * Grouping compares listings pairwise, so its cost grows with the square of
 * the input. The detail page used to hand it every listing in the "Electronics"
 * category -- all of them -- which took over a minute and blocked the server.
 */
export function selectCandidates(
  listing,
  pool,
  { minSimilarity = CANDIDATE_MIN_SIMILARITY, cap = CANDIDATE_CAP } = {}
) {
  const target = new Set(tokenize(modelTokens(listing.title)));
  const selfId = String(listing._id);

  const scored = [];
  for (const candidate of pool) {
    if (String(candidate._id) === selfId) continue;
    const { jaccard, overlap } = overlapScores(target, new Set(tokenize(modelTokens(candidate.title))));
    if (jaccard >= minSimilarity || overlap >= CANDIDATE_MIN_OVERLAP) {
      scored.push({ candidate, score: Math.max(jaccard, overlap) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const kept = scored.slice(0, cap - 1).map((s) => s.candidate);
  return [listing, ...kept].sort((a, b) => a.price - b.price);
}
