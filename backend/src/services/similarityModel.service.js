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
import { modelTokens, extractStorage, extractPtaStatus, extractModelCodes, extractScreenInches } from "./normalizeTitle.service.js";
import { extractRamGb } from "./productAttributes.service.js";

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
// a router's speed class "BE3600") or a store's own reference ("ISPK-0545", "SNS65", "ON INSTALLMENTS-UE001").
export const SHARED_CODE_LENGTH = 4;
export const SHARED_CODE_PRICE_GAP = 0.25;
const COMPUTER =
  /\b(laptop|notebook|macbook|chromebook|ultrabook|thinkpad|thinkbook|core\s*(i[3579]|ultra)|ryzen|intel|amd|celeron|pentium|cpu|gpu|rtx|gtx|ddr\d)\b/i;
// "Processor" alone marks a computer, but not in a TV's title: Samsung's "Q7F QLED 4K Vision AI Smart TV (Q4 AI Processor ...)" and TCL's
// "AiPQ Processor" were left out of the rule (2026-11-09, labelled pair r287).
const TV_TITLE = /\b(tv|television|qled|oled)\b/i;
const isComputer = (title) => COMPUTER.test(title) || (/\bprocessor\b/i.test(title) && !TV_TITLE.test(title));
const NOT_A_MODEL = /^(\d+(years?|yrs?|months?|days?)|hdr\d+|ddr\d+|lpddr\d+[a-z]?|wifi\d+|usb\d+|be\d{4}|ax\d{4}|ac\d{4}|ispk\d*|sns\d+|ue\d{3})$/;
export const brandOf = (title) => (String(title).toLowerCase().match(/[a-z0-9]+/) ?? [""])[0];
// The brand as one store writes it, or the line a store names alone: "A4tech Bloody MR710" and "Bloody MR710" are one maker's
// (2026-11-09, labelled pair r020). The second word counts only when it is a word of letters, four or more, so "Haier LED 55..."
// does not become the brand "led".
const brandWordsOf = (title) => {
  const [first = "", second = ""] = String(title).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return /^[a-z]{4,}$/.test(second) ? [first, second] : [first];
};
export function sameBrand(titleA, titleB) {
  const [firstA, ...restA] = brandWordsOf(titleA);
  const [firstB, ...restB] = brandWordsOf(titleB);
  return Boolean(firstA) && (firstA === firstB || restA.includes(firstB) || restB.includes(firstA));
}

export function sharedModelCode(itemA, itemB, { shortTvCode = false } = {}) {
  if (process.env.SHOPSAVVY_NO_SHARED_CODE) return null; // to measure the grouping without this rule (09-recheck-group-merges.js --save)
  if (isComputer(itemA.title) || isComputer(itemB.title)) return null;
  if (!sameBrand(itemA.title, itemB.title)) return null;
  const brands = new Set([...brandWordsOf(itemA.title), ...brandWordsOf(itemB.title)]);
  const sizes = statedSizes(itemA.title, itemB.title);
  const a = Number(itemA.price);
  const b = Number(itemB.price);
  const gap = a > 0 && b > 0 ? Math.abs(a - b) / Math.max(a, b) : Infinity;
  const distinctive = (code) =>
    code.length >= SHARED_CODE_LENGTH && /[a-z]/i.test(code) && /\d/.test(code) && !brands.has(code) && !NOT_A_MODEL.test(code);
  const codesA = [...withoutSizePrefix(extractModelCodes(itemA.title, { minCodeLength: 4 }), sizes)].filter(distinctive);
  const codesB = withoutSizePrefix(extractModelCodes(itemB.title, { minCodeLength: 4 }), sizes);
  const shared = codesA.find((code) => codesB.has(code));
  if (shared) return gap <= SHARED_CODE_PRICE_GAP && !differentVariant(itemA.title, itemB.title, shared) ? shared : null;
  const yearless = sameTvWithoutYearLetter(itemA.title, itemB.title, sizes) ?? (shortTvCode ? sameTvShortCode(itemA.title, itemB.title) : null);
  return yearless && gap <= YEAR_LETTER_PRICE_GAP ? yearless : null;
}

// A TV's code written with its screen size and without: Samsung's "55Q7F" and "Q7F" (2026-11-09, labelled pair r287). A code of
// three characters is too short for the rule above, so only when one title's code is the screen size both titles state followed by
// the other title's code, and (as for the year letter) the prices are within YEAR_LETTER_PRICE_GAP.
function sameTvShortCode(titleA, titleB) {
  const sized = (title) => [...extractModelCodes(title, { minCodeLength: 4 })]
    .map((code) => code.match(/^(\d{2,3})([a-z][a-z0-9]{2})$/))
    .filter((m) => m && /\d/.test(m[2]));
  // The size the title states, or else the one its own code begins with ("TCL 75P8L 75''": the size reader does not read 75'').
  const sizeOf = (title) => {
    const stated = extractScreenInches(title);
    if (stated !== null) return String(Math.round(stated));
    const prefixes = new Set(sized(title).map((m) => m[1]));
    return prefixes.size === 1 ? [...prefixes][0] : null;
  };
  const size = sizeOf(titleA);
  if (size === null || size !== sizeOf(titleB)) return null; // both, the same
  const withSize = (title) => sized(title).filter((m) => m[1] === size).map((m) => m[2]);
  const short = (title) => [...extractModelCodes(title, { minCodeLength: 3 })].filter((code) => code.length === 3);
  const codesB = new Set([...short(titleB), ...withSize(titleB)]);
  const found = withSize(titleA).find((code) => codesB.has(code)) ?? withSize(titleB).find((code) => short(titleA).includes(code));
  if (found) return found;
  // Both written "Q7F", when both titles state the size themselves ("SAMSUNG 65" QLED Q7F" and "Samsung 65" Q7F 4K AI Smart TV").
  const bothStated = extractScreenInches(titleA) !== null && extractScreenInches(titleB) !== null;
  return bothStated ? short(titleA).find((code) => /^[a-z]/.test(code) && short(titleB).includes(code)) ?? null : null;
}

// A word after the code that names a different variant of it: "Anker Soundcore R50i NC" (noise cancelling) is not the R50i, and
// joined it once "Soundcore by Anker R50i" was read as the same brand (2026-11-09). Not words a TV's name continues with: "QN70F
// Neo QLED", "H75M80FUX Mini LED", "55P79L Ultra HD" (tried, and those TVs' groups came apart).
const VARIANT_AFTER_CODE = new Set(["nc", "anc", "pro", "plus", "max", "lite"]);
function differentVariant(titleA, titleB, code) {
  const after = (title) => {
    const words = String(title).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const at = words.findIndex((word) => word === code || word.endsWith(code));
    const next = at >= 0 ? words[at + 1] : undefined;
    return VARIANT_AFTER_CODE.has(next) ? next : null;
  };
  return after(titleA) !== after(titleB);
}

// A TV's code with and without its last letter, the model year (Samsung's 65Q60D is the 2024 Q60; a store wrote "65Q60", 2026-11-09,
// labelled pair r089). Only codes that begin with the screen size both titles state, so a phone's name ("A15" and "A15s", two Oppo
// phones) never matches this way, and only when the prices are within YEAR_LETTER_PRICE_GAP: a different year's set, still on sale,
// is usually priced apart.
export const YEAR_LETTER_PRICE_GAP = 0.1;
function sameTvWithoutYearLetter(titleA, titleB, sizes) {
  const tvCodes = (title) =>
    [...extractModelCodes(title, { minCodeLength: 4 })].filter((code) => {
      const size = code.match(/^(\d{2,3})(?=[a-z])/)?.[1];
      return size && sizes.has(size) && /\d/.test(code.slice(size.length));
    });
  const codesB = tvCodes(titleB);
  for (const codeA of tvCodes(titleA)) {
    for (const codeB of codesB) {
      const [short, long] = codeA.length < codeB.length ? [codeA, codeB] : [codeB, codeA];
      if (long.length === short.length + 1 && long.startsWith(short) && /[a-z]$/.test(long) && /\d$/.test(short)) return long;
    }
  }
  return null;
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

/**
 * A title without its store's own wording: a seller's name, an instalment or delivery offer, a gift, a warranty line or a store
 * reference ("Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease" is
 * "Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved"). Only those pieces go: a "|" segment, a " - " tail or a closing bracket
 * that is such wording, and store codes anywhere. Everything that describes the product stays, the PTA status and condition too.
 * Nearly all of it is AlfaMall's sellers' (counted 2026-11-09). Used only for the second try in mlMatchStrategy, never to show.
 */
const STORE_WORDING =
  /\b(warranty|installments?|instal+ment|markup|delivery|free|gift|surprise|price in pakistan|electro ?ease|homecart|techelite|electronix hub|hub|et|authentico(\.pk)?|spark technologies|official (infinix |samsung |)store|mart|pak mobiles)\b/i;
const STORE_CODE = /\(?\b(ispk-?\d+|sns\d+|ns\d+)\b\)?/gi;
const STORE_PHRASE = /\b(free|fast) (home )?delivery\b/gi;
// A piece of store wording may also state the condition or PTA status ("3 Months Warranty (Used)"): those words are kept.
const KEPT_IN_WORDING = /\b(used|refurbished|renewed|open box|pre-?owned|like (a )?new|box pack(ed)?|non[- ]?pta|pta approved|pta)\b/gi;
const drop = (piece) => (piece.match(KEPT_IN_WORDING) ?? []).map((word) => ` ${word}`).join("");
// Store wording in the running text, from where it starts to the end of the title ("Redmi Note 15 8GB 128GB Official Pta Approved
// 1Year Official Warranty At 0% Markup On Upto 6 Months Installments By Microtel Trading"): sellers put it after the product.
const STORE_RUN = /\s*[([]?\s*\b(with\s+)?(\d+\s*years?\s+(official\s+|brand\s+)?warranty|official\s+warranty|(at\s+)?\d+%\s+markup|on\s+(easy\s+)?(monthly\s+)?install?ments?|easy\s+monthly\s+install?ments?)\b.*$/i;
export function withoutStoreWording(title) {
  let text = String(title || "").replace(STORE_CODE, " ").replace(STORE_PHRASE, " ");
  text = text.replace(STORE_RUN, (run) => drop(run));
  text = text.split("|").map((segment, i) => (i > 0 && STORE_WORDING.test(segment) ? drop(segment) : segment)).filter((s) => s.trim()).join("|");
  let previous;
  do {
    previous = text;
    text = text
      .replace(/\s*[-–]\s*([^-–|()]*(\([^)]*\))?[^-–|()]*)\s*$/, (whole, tail) => (STORE_WORDING.test(tail) ? drop(tail) : whole))
      .replace(/\s*\(([^()]*)\)\s*$/, (whole, inside) => (STORE_WORDING.test(inside) ? drop(inside) : whole))
      .replace(/[\s|_([–-]+$/, "");
  } while (text !== previous);
  return text.replace(/\s+/g, " ").trim();
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
// With the short TV code ("55Q7F" / "Q7F") only here, where finished groups join: in every pair comparison it re-formed the TVs'
// groups (1,744 to 1,606, a few of them wrongly, 2026-11-09).
mlMatchStrategy.sameModel = (itemA, itemB) => sharedModelCode(itemA, itemB, { shortTvCode: true });

// The grouping's other last pass (productGrouping.service.js mergeStoreWordedGroups): two group titles are one product once the
// store's wording is taken out of both, asked only when at least one of them has some (otherwise the grouping already compared
// them as they are).
// Not for computers (a Dell Latitude 7400 joined a 5400 when tried, 2026-11-09), and never a used or like-new unit with a new one
// (an S25 Ultra "3 Month Warranty Like a New" at PKR 322,000 joined new ones at 355,000+: the member checks do not read "like new").
const SECOND_HAND = /\b(used|refurbished|renewed|open box|pre-?owned|like (a )?new)\b/i;
// RAM also as sellers write it in short, "8+256GB" or "12 256GB", which extractRamGb does not read ("Nothing Phone 4a 8+256GB"
// joined the 12GB 4a when tried).
const ramOf = (title) => {
  const stated = extractRamGb(title);
  if (stated !== null) return stated;
  const short = String(title).match(/\b(\d{1,2})\s*(?:gb)?\s*[+/]\s*\d{2,4}\s*gb\b/i) ?? String(title).match(/\b(\d{1,2})\s+\d{2,4}\s*gb\b/i);
  return short ? Number(short[1]) : null;
};
export function samePlainTitles(itemA, itemB) {
  if (isComputer(itemA.title) || isComputer(itemB.title)) return false;
  if (SECOND_HAND.test(itemA.title) !== SECOND_HAND.test(itemB.title)) return false;
  const plainA = withoutStoreWording(itemA.title);
  const plainB = withoutStoreWording(itemB.title);
  if (!plainA || !plainB || (plainA === itemA.title && plainB === itemB.title)) return false;
  const ramA = ramOf(plainA);
  const ramB = ramOf(plainB);
  if (ramA !== null && ramB !== null && ramA !== ramB) return false;
  return classifyPairML({ ...itemA, title: plainA }, { ...itemB, title: plainB }).isMatch;
}
mlMatchStrategy.samePlainTitles = samePlainTitles;
