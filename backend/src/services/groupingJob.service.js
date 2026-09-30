// groupingJob.service.js — the grouping computation as one pure function.
//
// Both the worker thread and the in-thread path call this, so the two cannot drift
// apart: a result never depends on which one ran it.

import { groupListingsByProduct } from "./productGrouping.service.js";
import { mlMatchStrategy } from "./similarityModel.service.js";
import { attachRecommendationsToGroups } from "./recommendation/recommendation.service.js";

/**
 * @param {object[]} listings  plain listing objects (with priceHistory attached)
 * @param {object}   [options]
 * @param {"ml"|"rule"} [options.strategy]  "ml" (default, trained classifier) or "rule" (original Jaccard rule)
 * @param {boolean}  [options.recommend]    also attach recommendations and deal scores' verdicts to each group
 */
export function groupAndRecommend(listings, { strategy = "ml", recommend = true } = {}) {
  const groups = groupListingsByProduct(listings, {
    matchStrategy: strategy === "rule" ? undefined : mlMatchStrategy,
  });
  return recommend ? attachRecommendationsToGroups(groups) : groups;
}
