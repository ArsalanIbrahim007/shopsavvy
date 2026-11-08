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
import { attributeConflict, tokenize, sameSet, statedSizes, withoutSizePrefix } from "./similarity.service.js";
import { modelTokens, extractStorage, extractPtaStatus, extractModelCodes } from "./normalizeTitle.service.js";

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
// Two titles naming the same distinctive model code are one product, whatever else their wording says (2026-11-08: "TCL 40" QLED
// Smart TV (40S59K)" and "TCL - Smart Google TV QLED 40 inch - S59K - 40S59K - (SNS65)" scored 0.17, kept apart because one title
// carries an extra internal code). Only after the veto above (stated size, storage, PTA, generation...), only for a code with letters
// and digits of at least SHARED_CODE_LENGTH characters (a leading screen size dropped), and only when the prices are within
// SHARED_CODE_PRICE_GAP of each other (a code shared by a product and its accessory, or a typo, is far apart in price).
// Not for computers: a processor's code ("1355U", "13420H") is shared by many different laptops.
// Both titles must start with the same brand, and the code must not be that brand ("A4Tech" joined 3,206 pairs of different
// headsets in the first measurement) nor a code that is not a model: a warranty ("1Year", "6Months"), a spec ("HDR10", "DDR5",
// a router's speed class "BE3600") or a store's own reference ("ISPK-0545", "SNS65").
export const SHARED_CODE_LENGTH = 4;
export const SHARED_CODE_PRICE_GAP = 0.25;
const COMPUTER =
  /\b(laptop|notebook|macbook|chromebook|ultrabook|thinkpad|thinkbook|core\s*(i[3579]|ultra)|ryzen|intel|amd|celeron|pentium|processor|cpu|gpu|rtx|gtx|ddr\d)\b/i;
const NOT_A_MODEL = /^(\d+(years?|yrs?|months?|days?)|hdr\d+|ddr\d+|lpddr\d+[a-z]?|wifi\d+|usb\d+|be\d{4}|ax\d{4}|ac\d{4}|ispk\d*|sns\d+)$/;
export const brandOf = (title) => (String(title).toLowerCase().match(/[a-z0-9]+/) ?? [""])[0];

export function sharedModelCode(itemA, itemB) {
  if (process.env.SHOPSAVVY_NO_SHARED_CODE) return null; // to measure the grouping without this rule (09-recheck-group-merges.js --save)
  if (COMPUTER.test(itemA.title) || COMPUTER.test(itemB.title)) return null;
  const brand = brandOf(itemA.title);
  if (!brand || brand !== brandOf(itemB.title)) return null;
  const sizes = statedSizes(itemA.title, itemB.title);
  const distinctive = (code) =>
    code.length >= SHARED_CODE_LENGTH && /[a-z]/i.test(code) && /\d/.test(code) && code !== brand && !NOT_A_MODEL.test(code);
  const codesA = [...withoutSizePrefix(extractModelCodes(itemA.title, { minCodeLength: 4 }), sizes)].filter(distinctive);
  if (codesA.length === 0) return null;
  const codesB = withoutSizePrefix(extractModelCodes(itemB.title, { minCodeLength: 4 }), sizes);
  const shared = codesA.find((code) => codesB.has(code));
  if (!shared) return null;
  const a = Number(itemA.price);
  const b = Number(itemB.price);
  if (!(a > 0 && b > 0) || Math.abs(a - b) / Math.max(a, b) > SHARED_CODE_PRICE_GAP) return null;
  return shared;
}

/**
 * True when the titles name one model number under different hyphened prefixes: Sony's WH-1000XM6 headphones and WF-1000XM6
 * earbuds share "1000XM6", and the classifier put "Sony WF-1000XM6 Wireless Headphones" with the headphones. Only a hyphen joins
 * a prefix ("LED 55S80EUX" and "TV 55S80EUX" are one TV), and only a number-led code has one.
 */
export function prefixConflict(titleA, titleB) {
  const hyphened = (title) => new Map([...String(title).matchAll(/\b([a-z]{1,4})-(\d[a-z0-9]{3,})\b/gi)].map((m) => [m[2].toLowerCase(), m[1].toLowerCase()]));
  const a = hyphened(titleA);
  if (a.size === 0) return false;
  for (const [code, prefix] of hyphened(titleB)) if (a.has(code) && a.get(code) !== prefix) return true;
  return false;
}

export function classifyPairML(itemA, itemB) {
  if (attributeConflict(itemA.title, itemB.title, { ignoreUnstatedStorage: true }) || prefixConflict(itemA.title, itemB.title)) {
    return { isMatch: false, probability: 0 };
  }
  if (sharedModelCode(itemA, itemB)) return { isMatch: true, probability: 1, reason: "shared model code" };

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

// The grouping's last pass (productGrouping.service.js mergeSameModelGroups) joins groups of one model that the first-match loop
// left apart; groupListingsByProduct takes it from the strategy, so every caller using the trained strategy gets it.
mlMatchStrategy.sameModel = sharedModelCode;
