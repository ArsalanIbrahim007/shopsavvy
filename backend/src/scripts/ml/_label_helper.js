// _label_helper.js — applies the documented labeling rubric to pairs.raw.json
// mechanically wherever the rubric IS mechanical (attribute agreement, price
// proximity), and flags pairs needing real semantic judgment (accessory vs
// device, bundle text, condition mismatch) that no extractor currently
// catches. This is a one-off authoring aid, not part of the numbered
// pipeline (01/03/04/05/06) — its output is reviewed and finalized by hand
// into pairs.labeled.json.
//
// Usage: node src/scripts/ml/_label_helper.js
// Output: src/ml/dataset/pairs.suggested.json

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { extractStorage, extractScreenInches, extractPtaStatus, extractModelCodes } from "../../services/normalizeTitle.service.js";
import { extractRamGb } from "../../services/productAttributes.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");

const pairs = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.raw.json"), "utf8"));

// Words that mark an accessory/bundle-extra rather than the device itself.
// None of these appear in normalizeTitle's strip list or productCategory's
// exclusion phrases for every category (e.g. "case" isn't excluded for
// tablet/smartwatch categories the same way it is for smartphone), so a pair
// like an iPad vs an iPad case can still land in the same category bucket.
const ACCESSORY_MARKERS = [
  "case", "cover", "flip cover", "screen guard", "screen protector", "tempered glass",
  "charger", "adapter", "cable", "strap", "band", "holder", "stand", "pouch", "sleeve",
  "skin", "sticker", "pencil", "stylus", "keyboard cover", "power bank",
];
const CONDITION_MARKERS = ["refurbished", "used", "open box", "renewed"];

function hasMarker(title, markers) {
  const t = title.toLowerCase();
  return markers.find((m) => t.includes(m)) || null;
}

function attrsFor(title) {
  return {
    storage: extractStorage(title),
    ram: extractRamGb(title),
    screen: extractScreenInches(title),
    pta: extractPtaStatus(title),
    modelCodes: [...extractModelCodes(title)],
  };
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function priceDriftPct(priceA, priceB) {
  if (!priceA || !priceB) return null;
  return Math.abs(priceA - priceB) / ((priceA + priceB) / 2);
}

// extractModelCodes only catches >=4-char alphanumeric codes (QN70F,
// FA2787NR) and misses short model/generation numbers that are equally
// decisive in practice: "A26" vs "A56", "S24" vs "S25", or a bare trailing
// generation digit as in "Fold 5" vs "Fold 8". Any token containing a digit
// is a candidate identifier; if the SET of such tokens differs between two
// titles (after removing shared capacity/RAM tokens, handled separately),
// that's a strong same-line-different-model signal the core codebase's
// extractModelCodes currently misses.
function digitTokens(title) {
  return new Set(
    title.toLowerCase().split(/\s+/).filter((t) => /\d/.test(t) && !/^\d+(gb|tb|mb)$/.test(t) && t !== "5g" && t !== "4g")
  );
}

function shortModelNumberConflict(titleA, titleB) {
  const a = digitTokens(titleA);
  const b = digitTokens(titleB);
  if (a.size === 0 || b.size === 0) return false;
  // Conflict only if neither side's digit-token set is a subset of the
  // other's (a bare "iphone 15" vs "iphone 15 pro max 1tb" shouldn't
  // conflict just because one side also mentions "1tb"-like tokens elsewhere
  // -- but capacity tokens are already filtered out above, so remaining
  // digit tokens here are specifically model/generation numbers).
  const aArr = [...a], bArr = [...b];
  const disjoint = aArr.every((t) => !b.has(t)) && bArr.every((t) => !a.has(t));
  return disjoint;
}

const results = pairs.map((pair) => {
  const attrsA = attrsFor(pair.titleA);
  const attrsB = attrsFor(pair.titleB);
  const accessoryA = hasMarker(pair.titleA, ACCESSORY_MARKERS);
  const accessoryB = hasMarker(pair.titleB, ACCESSORY_MARKERS);
  const conditionA = hasMarker(pair.titleA, CONDITION_MARKERS);
  const conditionB = hasMarker(pair.titleB, CONDITION_MARKERS);

  const oneIsAccessory = Boolean(accessoryA) !== Boolean(accessoryB);
  const conditionMismatch = Boolean(conditionA) !== Boolean(conditionB);

  let suggestedLabel = null;
  let rationale = "";
  let needsReview = false;

  if (oneIsAccessory) {
    suggestedLabel = 0;
    rationale = `accessory/bundle-extra vs device (marker: "${accessoryA || accessoryB}")`;
    needsReview = true; // confirm the marker actually means what it looks like
  } else if (conditionMismatch) {
    suggestedLabel = 0;
    rationale = `condition mismatch (${conditionA ? "A" : "B"} is ${conditionA || conditionB}, other is new)`;
    needsReview = true;
  } else {
    // Mechanical rubric: same as attributeConflict but computed explicitly
    // per-attribute for a transparent, citable rationale.
    const bothStorage = attrsA.storage !== null && attrsB.storage !== null;
    const bothRam = attrsA.ram !== null && attrsB.ram !== null;
    const bothScreen = attrsA.screen !== null && attrsB.screen !== null;
    const bothPta = attrsA.pta !== "unknown" && attrsB.pta !== "unknown";
    const bothCodes = attrsA.modelCodes.length > 0 && attrsB.modelCodes.length > 0;

    if (bothStorage && attrsA.storage !== attrsB.storage) {
      suggestedLabel = 0; rationale = `storage differs (${attrsA.storage}GB vs ${attrsB.storage}GB)`;
    } else if (bothRam && attrsA.ram !== attrsB.ram) {
      suggestedLabel = 0; rationale = `RAM differs (${attrsA.ram}GB vs ${attrsB.ram}GB)`;
    } else if (bothScreen && attrsA.screen !== attrsB.screen) {
      suggestedLabel = 0; rationale = `screen size differs (${attrsA.screen}" vs ${attrsB.screen}")`;
    } else if (bothPta && attrsA.pta !== attrsB.pta) {
      suggestedLabel = 0; rationale = `PTA status differs (${attrsA.pta} vs ${attrsB.pta})`;
    } else if (bothCodes && !setsEqual(attrsA.modelCodes, attrsB.modelCodes)) {
      suggestedLabel = 0; rationale = `model codes differ (${attrsA.modelCodes} vs ${attrsB.modelCodes})`;
    } else if (shortModelNumberConflict(pair.titleA, pair.titleB)) {
      suggestedLabel = 0;
      rationale = `disjoint short model/generation numbers not caught by extractModelCodes (e.g. A26 vs A56, S24 vs S25, Fold 5 vs Fold 8)`;
    } else {
      // No stated attribute conflicts. Decide via jaccard + price proximity.
      const drift = priceDriftPct(pair.priceA, pair.priceB);
      const anyUnstatedCapacity = !bothStorage || !bothRam;

      if (pair.jaccardBase >= 0.5) {
        if (anyUnstatedCapacity && drift !== null && drift > 0.15) {
          suggestedLabel = 0;
          rationale = `high text overlap but unstated capacity + price drift ${(drift * 100).toFixed(0)}% >15%`;
          needsReview = true; // borderline, worth a human eye
        } else {
          suggestedLabel = 1;
          rationale = `no attribute conflict, jaccard ${pair.jaccardBase} ≥ 0.5${drift !== null ? `, price drift ${(drift * 100).toFixed(0)}%` : ""}`;
          if (pair.jaccardBase < 0.65) needsReview = true; // below old 0.70 rule threshold, genuinely the interesting zone
        }
      } else {
        suggestedLabel = 0;
        rationale = `no attribute conflict but low text overlap (jaccard ${pair.jaccardBase} < 0.5) — likely different model line`;
        if (pair.jaccardBase >= 0.35) needsReview = true; // could still be a genuine match phrased very differently
      }
    }
  }

  return { ...pair, attrsA, attrsB, suggestedLabel, rationale, needsReview };
});

writeFileSync(join(DATASET_DIR, "pairs.suggested.json"), JSON.stringify(results, null, 2));

const reviewCount = results.filter((r) => r.needsReview).length;
const labelCounts = results.reduce((acc, r) => { acc[r.suggestedLabel] = (acc[r.suggestedLabel] || 0) + 1; return acc; }, {});
console.log(`Total pairs: ${results.length}`);
console.log(`Label counts:`, labelCounts);
console.log(`Flagged for manual review: ${reviewCount}`);
console.log(`Wrote pairs.suggested.json`);
