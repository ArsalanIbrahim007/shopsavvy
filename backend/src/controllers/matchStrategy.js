// matchStrategy.js — which matcher groups a request's listings: the trained model, or ?matching=rule.

/**
 * The trained classifier is the default matching strategy as of 2026-09-28
 * (see backend/src/ml/EVALUATION_REPORT.md: F1 0.923 vs the old fixed-
 * threshold rule's 0.667 on held-out data). ?matching=rule falls back to
 * the original Jaccard-threshold behaviour -- kept reachable, not deleted,
 * as an escape hatch if the trained model ever needs to be compared
 * against or rolled back live without a code change.
 */
export function resolveMatchStrategy(req) {
  return req.query.matching === "rule" ? "rule" : "ml";
}
