// similarityModel.service.js — the trained-classifier alternative to the
// fixed-threshold Jaccard decision in similarity.service.js. Not wired into
// the live API by default (see productGrouping.service.js's matchStrategy
// parameter) -- this exists for the side-by-side comparison in
// src/scripts/ml/06-compare-grouping.js and src/scripts/checks/test-grouping-ml.js. Flipping
// the live default is a deliberate one-line change for later, after the
// team has reviewed the evaluation numbers in src/ml/EVALUATION_REPORT.md.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { buildFeatureVector } from "../ml/features.js";
import { FILLER_WORDS } from "../ml/fillerWords.js";
import { predictProba } from "../ml/logisticRegression.js";
import { attributeConflict, tokenize, sameSet } from "./similarity.service.js";
import { modelTokens, extractStorage, extractPtaStatus } from "./normalizeTitle.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The live model. SHOPSAVVY_MATCH_MODEL names another artifact in src/ml/ to try a
// candidate against the whole database without replacing this file.
const ARTIFACT_PATH = join(__dirname, "..", "ml", process.env.SHOPSAVVY_MATCH_MODEL || "model.artifact.json");

let model = null;
function loadModel() {
  if (!model) {
    model = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  }
  return model;
}

/**
 * Classifies a title pair as the same product using the trained model.
 * The attribute-constraint veto stays an absolute pre-filter -- a known
 * fact (differing stated storage, PTA status, etc.) is never left to the
 * model to overrule, exactly as in the rule-based isSimilarProduct.
 *
 * @param {{title:string, price?:number}} itemA
 * @param {{title:string, price?:number}} itemB
 * @returns {{isMatch: boolean, probability: number}}
 */
export function classifyPairML(itemA, itemB) {
  if (attributeConflict(itemA.title, itemB.title, { ignoreUnstatedStorage: true })) {
    return { isMatch: false, probability: 0 };
  }

  const loadedModel = loadModel();
  const features = buildFeatureVector(
    {
      titleA: itemA.title,
      titleB: itemB.title,
      priceA: itemA.price ?? null,
      priceB: itemB.price ?? null,
    },
    loadedModel.featureNames
  );
  const probability = predictProba(features, loadedModel);

  return { isMatch: probability >= loadedModel.threshold, probability };
}

// Price tolerance when a capacity is missing on either side, matching the rule
// strategy's tiebreak: a different capacity of one model differs by tens of
// per cent, the same unit across stores by a few.
const UNSTATED_CAPACITY_PRICE_DRIFT = 0.15;

// Members compared individually when the representative does not match.
// Bounds the extra work on very large groups.
const MAX_MEMBER_CHECKS = 40;

// The same reading as productGrouping's ptaOf: the title first, else the status the store's page gave.
const isPtaApproved = (offer) => {
  const stated = extractPtaStatus(offer.title || offer.normalizedTitle || "");
  return (stated !== "unknown" ? stated : offer.ptaStatus) === "pta_approved";
};

function fillerFreeTokens(title) {
  return new Set(tokenize(modelTokens(title)).filter((t) => !FILLER_WORDS.has(t)));
}

/**
 * Same signature as productGrouping.service.js's ruleMatchStrategy, so it
 * can be passed as groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy }).
 *
 * A group is represented by its most detailed title ("... 8GB RAM 256GB
 * Storage PTA Approved"). A plainer listing of the same phone ("... Dual Sim
 * With Official Warranty") scores poorly against that title even though it is
 * the same product as the group's plainer members, which left popular phones
 * split into a main group plus one-offer groups. So when the representative
 * does not match, the listing may still join through a member whose title is
 * identical once filler words are removed.
 *
 * The fallback deliberately does not use the classifier: filler words inflate
 * its similarity, and trying members with it chained Z Fold 5, 6 and 8, and
 * five different Oppo Reno models, into single groups. Joining also still
 * requires that the listing conflict with no member (checked by the grouping
 * loop).
 */
export function mlMatchStrategy(rawTitle, group, listing) {
  const groupPrice = group.lowestPrice != null && group.highestPrice != null
    ? (group.lowestPrice + group.highestPrice) / 2
    : null;

  // When only one side states a capacity, the classifier cannot tell the variants apart (a bare "Galaxy S26 Ultra" at PKR 388,999
  // scored 0.66 against a 256GB unit at PKR 269,999), so the price must agree as well, as in the rule strategy and the member
  // fallback below. Except an offer cheaper than a group that has PTA-approved offers: productGrouping's separateLikelyNonPta moves
  // such an offer out after grouping and labels it "likely non-PTA" for the shopper, so it is let in for that. (The opposite order,
  // a dear approved bare title meeting a cheap stated group, does not arise: titles that state a capacity are grouped first.)
  const ownStorage = extractStorage(rawTitle);
  const oneCapacityUnstated = (ownStorage === null) !== (extractStorage(group.rawGroupKey) === null);
  const leftToPtaSeparation = groupPrice !== null && listing.price < groupPrice && (group.offers || []).some(isPtaApproved);
  const priceAgrees = !oneCapacityUnstated || groupPrice === null || !(listing.price > 0) || leftToPtaSeparation
    || Math.abs(listing.price - groupPrice) / groupPrice <= UNSTATED_CAPACITY_PRICE_DRIFT;

  if (priceAgrees && classifyPairML(
    { title: rawTitle, price: listing.price },
    { title: group.rawGroupKey, price: groupPrice }
  ).isMatch) return true;

  const own = fillerFreeTokens(rawTitle);
  if (own.size < 2) return false;

  let checks = 0;
  for (const member of group.offers || []) {
    if (++checks > MAX_MEMBER_CHECKS) break;
    const title = member.title || member.normalizedTitle || "";
    if (!title || !sameSet(own, fillerFreeTokens(title))) continue;

    const capacityUnstated = ownStorage === null || extractStorage(title) === null;
    if (capacityUnstated && member.price > 0) {
      const drift = Math.abs(listing.price - member.price) / member.price;
      if (drift > UNSTATED_CAPACITY_PRICE_DRIFT) continue;
    }
    return true;
  }

  return false;
}
