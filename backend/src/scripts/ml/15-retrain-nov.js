// 15-retrain-nov.js — the November retrain: the three labelling sheets of 18 Nov merged, a candidate trained, and both it and the live
// model tested once on pairs neither ever trained on.
//
// The plan it follows (written before any label came back):
//   - the 99 sealed pairs were chosen when the pairs were mined (pairs_nov18.raw.json `sealed`), before anyone labelled them; they are
//     the new test set and nothing here looks at them until the final scoring;
//   - 60 pairs were labelled by two people independently: their agreement (Cohen's kappa) is reported, and a pair they disagree on is
//     used only when labelling/resolved.csv settles it (pair_id,label), otherwise it is left out;
//   - "unsure" labels are left out;
//   - training: the old training split (split.json `train`) plus the new pairs that are not sealed, less any pair sharing a listing or
//     product family with a test pair (old or sealed), so no product is on both sides;
//   - the decision threshold is chosen by grouped 5-fold cross-validation on the training pairs only (F0.5, as 04-train.js);
//   - scored once on the sealed pairs and on the old 164-pair evaluation set (split.json `test` + `evalOnly`): the candidate, the live
//     model and the word-overlap rule, each behind the same attribute veto the live system applies.
//
// It never writes model.artifact.json (the live model). The candidate goes to src/ml/model.artifact.v4-nov.json; promoting it is a
// separate decision, taken only after regrouping the whole database and reading the changed groups.
//
// Usage: node src/scripts/ml/15-retrain-nov.js [--sheets=DIR] [--simulate]
//   --sheets    folder holding sheet-*.csv (default D:/FYP PROJECT/labelling)
//   --simulate  checks the pipeline before the labels exist: labels are invented from the word-overlap rule, nothing is written to
//               src/ml, and the printed numbers mean nothing.
// Output: src/ml/model.artifact.v4-nov.json and src/ml/RETRAIN_NOV_REPORT.md

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildFeatureVector, FEATURE_NAMES } from "../../ml/features.js";
import { trainLogisticRegression, predictProba } from "../../ml/logisticRegression.js";
import { pairComponents } from "../../ml/dataset/family.js";
import { isSimilarProduct, attributeConflict } from "../../services/similarity.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ML_DIR = join(__dirname, "..", "..", "ml");
const DATASET_DIR = join(ML_DIR, "dataset");

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const SIMULATE = process.argv.includes("--simulate");
const SHEETS_DIR = arg("sheets") || "D:/FYP PROJECT/labelling";

// ---------- reading the sheets ----------

/** RFC 4180 CSV (quoted fields, doubled quotes, commas and line breaks inside quotes), as Excel saves it. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") { row.push(field); field = ""; } // Excel in some locales saves with ";"
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** "same" -> 1, "different" -> 0, "unsure" or blank -> null; tolerant of case, spaces and the obvious short forms. */
export function labelValue(text = "") {
  const t = String(text).trim().toLowerCase();
  if (/^(same|s|yes|y|1)$/.test(t)) return 1;
  if (/^(different|diff|d|no|n|0)$/.test(t)) return 0;
  return null;
}

/** Every sheet's labels: Map pairId -> [{ labeller, label, raw }]. */
function readSheets(dir) {
  const byPair = new Map();
  const files = readdirSync(dir).filter((f) => /^sheet-.+\.csv$/i.test(f));
  for (const file of files) {
    const labeller = file.replace(/^sheet-|\.csv$/gi, "");
    const [header, ...rows] = parseCsv(readFileSync(join(dir, file), "utf8"));
    const idCol = header.findIndex((h) => /pair_id/i.test(h));
    const labelCol = header.findIndex((h) => /^label/i.test(h.trim()));
    if (idCol < 0 || labelCol < 0) throw new Error(`${file}: no pair_id or label column`);
    for (const r of rows) {
      const id = (r[idCol] || "").trim();
      if (!id) continue;
      if (!byPair.has(id)) byPair.set(id, []);
      byPair.get(id).push({ labeller, label: labelValue(r[labelCol]), raw: (r[labelCol] || "").trim() });
    }
  }
  return { byPair, files };
}

/** Cohen's kappa for two raters over binary labels. */
export function cohenKappa(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a === 1).length / n;
  const pb = pairs.filter(([, b]) => b === 1).length / n;
  const chance = pa * pb + (1 - pa) * (1 - pb);
  return chance === 1 ? 1 : (agree - chance) / (1 - chance);
}

// ---------- training, as 04-train.js ----------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const featuresOf = (p) => buildFeatureVector({ titleA: p.titleA, titleB: p.titleB, priceA: p.priceA, priceB: p.priceB }, FEATURE_NAMES);
const weightsFor = (set) => {
  const pos = set.filter((p) => p.label === 1).length;
  return { 1: set.length / (2 * pos), 0: set.length / (2 * (set.length - pos)) };
};
const fit = (set) => trainLogisticRegression(set.map(featuresOf), set.map((p) => p.label), { epochs: 5000, lr: 0.15, l2: 0.02, classWeight: weightsFor(set) });

function chooseThreshold(train) {
  const FOLDS = 5, BETA = 0.5;
  const rng = mulberry32(777);
  const groups = pairComponents(train).map(([, members]) => members).sort(() => rng() - 0.5);
  const folds = Array.from({ length: FOLDS }, () => []);
  groups.sort((a, b) => b.length - a.length).forEach((g) => {
    const smallest = folds.reduce((m, f, i) => (f.length < folds[m].length ? i : m), 0);
    folds[smallest].push(...g);
  });
  const oof = [];
  folds.forEach((holdout, k) => {
    const m = fit(folds.filter((_, i) => i !== k).flat());
    holdout.forEach((p) => oof.push({ label: p.label, prob: predictProba(featuresOf(p), m) }));
  });
  const sweep = Array.from({ length: 14 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100).map((threshold) => {
    let tp = 0, fp = 0, fn = 0;
    for (const { label, prob } of oof) {
      const yes = prob >= threshold;
      if (yes && label) tp++; else if (yes) fp++; else if (label) fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
    const d = BETA * BETA * precision + recall;
    return { threshold, precision, recall, f: d ? ((1 + BETA * BETA) * precision * recall) / d : 0 };
  });
  return sweep.reduce((best, r) => (r.f >= best.f ? r : best), sweep[0]); // ties go to the higher, more careful threshold
}

// ---------- scoring ----------

const classifyWith = (artifact) => (pair) => {
  if (attributeConflict(pair.titleA, pair.titleB, { ignoreUnstatedStorage: true })) return 0;
  return predictProba(buildFeatureVector({ titleA: pair.titleA, titleB: pair.titleB, priceA: pair.priceA, priceB: pair.priceB }, artifact.featureNames), artifact) >= artifact.threshold ? 1 : 0;
};
const classifyRule = (pair) => (isSimilarProduct(pair.titleA, pair.titleB, 0.7) ? 1 : 0);

function score(pairs, classify) {
  const cm = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const p of pairs) {
    const yes = classify(p) === 1;
    if (yes && p.label === 1) cm.tp++; else if (yes) cm.fp++; else if (p.label === 1) cm.fn++; else cm.tn++;
  }
  const n = cm.tp + cm.fp + cm.fn + cm.tn;
  const precision = cm.tp + cm.fp ? cm.tp / (cm.tp + cm.fp) : 0, recall = cm.tp + cm.fn ? cm.tp / (cm.tp + cm.fn) : 0;
  return { ...cm, accuracy: n ? (cm.tp + cm.tn) / n : 0, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}

/** F1 interval from 1,000 resamples of the pairs (95%). */
function f1Interval(pairs, classify, seed = 20261122) {
  const rng = mulberry32(seed);
  const preds = pairs.map((p) => [p.label, classify(p)]);
  const f1s = [];
  for (let b = 0; b < 1000; b++) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < preds.length; i++) {
      const [label, yes] = preds[Math.floor(rng() * preds.length)];
      if (yes && label) tp++; else if (yes) fp++; else if (label) fn++;
    }
    f1s.push(tp ? (2 * tp) / (2 * tp + fp + fn) : 0);
  }
  f1s.sort((a, b) => a - b);
  return [f1s[25], f1s[974]];
}

// ---------- the run ----------

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const raw = JSON.parse(readFileSync(join(DATASET_DIR, "pairs_nov18.raw.json"), "utf8"));
const { train: oldTrain, test: oldTest, evalOnly } = JSON.parse(readFileSync(join(DATASET_DIR, "split.json"), "utf8"));
const oldEval = [...oldTest, ...evalOnly];
const live = JSON.parse(readFileSync(join(ML_DIR, "model.artifact.json"), "utf8"));

let byPair, files = [];
if (SIMULATE) {
  byPair = new Map(raw.pairs.map((p) => [p.pairId, p.labellers.map((labeller) => ({ labeller, label: classifyRule(p), raw: "simulated" }))]));
} else {
  ({ byPair, files } = readSheets(SHEETS_DIR));
}

const resolvedFile = join(SHEETS_DIR, "resolved.csv");
const resolved = new Map();
if (!SIMULATE && existsSync(resolvedFile)) {
  const [, ...rows] = parseCsv(readFileSync(resolvedFile, "utf8"));
  for (const [id, label] of rows) if (labelValue(label) !== null) resolved.set(id.trim(), labelValue(label));
}

const counts = { labelled: 0, unsure: 0, missing: 0, disagreed: 0, settled: 0 };
const kappaPairs = [];
const disagreements = [];
const newPairs = [];
for (const p of raw.pairs) {
  const marks = (byPair.get(p.pairId) || []).filter((m) => m.raw !== "");
  if (!marks.length) { counts.missing++; continue; }
  const decided = marks.filter((m) => m.label !== null);
  if (marks.length >= 2 && decided.length >= 2) kappaPairs.push([decided[0].label, decided[1].label]);
  let label;
  if (decided.length && decided.every((m) => m.label === decided[0].label) && decided.length === marks.length) label = decided[0].label;
  else if (decided.length >= 2 && decided.some((m) => m.label !== decided[0].label)) {
    counts.disagreed++;
    disagreements.push({ pairId: p.pairId, marks: marks.map((m) => `${m.labeller}: ${m.raw}`).join(", "), titleA: p.titleA, titleB: p.titleB });
    if (resolved.has(p.pairId)) { label = resolved.get(p.pairId); counts.settled++; }
  } else if (decided.length && decided.length < marks.length) {
    // one said same/different, the other unsure: not certain enough to train or test on
    label = resolved.get(p.pairId);
  }
  if (label === undefined || label === null) { counts.unsure += label === undefined && !disagreements.some((d) => d.pairId === p.pairId) ? 1 : 0; continue; }
  counts.labelled++;
  newPairs.push({ ...p, label, family: undefined });
}
const kappa = cohenKappa(kappaPairs);

const sealed = newPairs.filter((p) => p.sealed);
const newTrainPool = newPairs.filter((p) => !p.sealed);

// No product on both sides: drop training pairs that share a listing or family with any test pair.
const testPairs = [...sealed, ...oldEval];
const tag = (p, side) => ({ ...p, __side: side });
const components = pairComponents([...testPairs.map((p) => tag(p, "test")), ...[...oldTrain, ...newTrainPool].map((p) => tag(p, "train"))]);
const touched = new Set();
for (const [, members] of components) if (members.some((m) => m.__side === "test")) for (const m of members) if (m.__side === "train") touched.add(`${m.idA}|${m.idB}`);
const train = [...oldTrain, ...newTrainPool].filter((p) => !touched.has(`${p.idA}|${p.idB}`));
const dropped = oldTrain.length + newTrainPool.length - train.length;

console.log(`Sheets: ${SIMULATE ? "SIMULATED labels (pipeline check only)" : files.join(", ")}`);
console.log(`New pairs labelled ${counts.labelled} of ${raw.pairs.length}; not labelled ${counts.missing}; unsure ${counts.unsure}; disagreements ${counts.disagreed} (${counts.settled} settled)`);
console.log(`Double-labelled pairs with two decisions: ${kappaPairs.length}; Cohen's kappa ${kappa === null ? "n/a" : kappa.toFixed(3)}`);
console.log(`Training: ${train.length} pairs (${oldTrain.length} old + ${newTrainPool.length} new, ${dropped} left out for sharing a product with a test pair)`);

if (counts.labelled < 150 && !SIMULATE) {
  console.log("Fewer than half the new pairs are labelled: stopping before training. Run again when the sheets are back.");
  process.exit(1);
}

const model = fit(train);
const chosen = chooseThreshold(train);
const candidate = {
  featureNames: FEATURE_NAMES, weights: model.weights, bias: model.bias, means: model.means, stds: model.stds, threshold: chosen.threshold,
  thresholdSelection: { method: "grouped 5-fold cross-validation on the training pairs, maximising F0.5", crossValidatedPrecision: +chosen.precision.toFixed(3), crossValidatedRecall: +chosen.recall.toFixed(3) },
  trainedAt: new Date().toISOString(), trainingSize: train.length, classWeight: weightsFor(train),
};

const contenders = [
  ["Candidate (v4-nov)", classifyWith(candidate)],
  [`Live model (v1, ${live.trainingSize} pairs)`, classifyWith(live)],
  ["Word-overlap rule (Jaccard >= 0.70)", classifyRule],
];
const table = (pairs, title) => {
  const lines = [`### ${title} (${pairs.length} pairs, ${pairs.filter((p) => p.label === 1).length} same)`, "",
    "| Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |", "|---|---|---|---|---|---|"];
  for (const [name, classify] of contenders) {
    const s = score(pairs, classify);
    const [lo, hi] = f1Interval(pairs, classify);
    lines.push(`| ${name} | ${pct(s.accuracy)} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} (${pct(lo)} to ${pct(hi)}) | ${s.tp} / ${s.fp} / ${s.fn} |`);
  }
  return lines.join("\n");
};

const byCategory = (pairs) => {
  const cats = [...new Set(pairs.map((p) => p.categoryA))].sort();
  const lines = ["| Category | Pairs | Same | Candidate F1 | Live F1 | Rule F1 |", "|---|---|---|---|---|---|"];
  for (const c of cats) {
    const set = pairs.filter((p) => p.categoryA === c);
    const f = contenders.map(([, cl]) => pct(score(set, cl).f1));
    lines.push(`| ${c} | ${set.length} | ${set.filter((p) => p.label === 1).length} | ${f.join(" | ")} |`);
  }
  return lines.join("\n");
};

const report = [
  "# November retrain: candidate v4-nov against the live model",
  "",
  `Generated ${new Date().toISOString()} by \`src/scripts/ml/15-retrain-nov.js\`${SIMULATE ? " — **SIMULATED LABELS: these numbers mean nothing**" : ""}.`,
  "",
  "## Labels",
  "",
  `- New pairs labelled: ${counts.labelled} of ${raw.pairs.length} (not labelled ${counts.missing}, unsure ${counts.unsure}, disagreements ${counts.disagreed}, of which settled ${counts.settled}).`,
  `- Agreement between two labellers on ${kappaPairs.length} pairs: Cohen's kappa **${kappa === null ? "n/a" : kappa.toFixed(3)}** (above 0.8 is usually read as strong agreement, 0.6 to 0.8 as substantial).`,
  `- Training: ${train.length} pairs (${oldTrain.length} from the earlier rounds, ${newTrainPool.length} new; ${dropped} left out because they share a listing or product family with a test pair).`,
  `- Threshold ${chosen.threshold}, chosen by grouped 5-fold cross-validation on the training pairs only (precision ${pct(chosen.precision)}, recall ${pct(chosen.recall)} there).`,
  "",
  "## Results on pairs no model trained on",
  "",
  "The sealed pairs were set aside when they were mined on 18 Nov, before labelling, and were not looked at until this run.",
  "",
  table(sealed, "Sealed November test set"),
  "",
  byCategory(sealed),
  "",
  table(oldEval, "The earlier 164-pair evaluation set"),
  "",
  "Each model sits behind the same attribute veto the live site applies (different storage, size and so on is never merged).",
  "",
  "## Disagreements between labellers",
  "",
  ...(disagreements.length ? disagreements.map((d) => `- ${d.pairId}: ${d.marks} — "${d.titleA}" / "${d.titleB}"`) : ["None."]),
  "",
  "## What happens next",
  "",
  "The candidate is in `src/ml/model.artifact.v4-nov.json`. It replaces the live model only if it is better on the sealed set **and** a",
  "regroup of the whole database, with the changed groups read, shows no new wrong merges. Otherwise the live model stays and these",
  "figures are reported as the result.",
];

console.log("\n" + report.slice(report.indexOf("## Results on pairs no model trained on")).join("\n"));
if (SIMULATE) {
  console.log("\n(simulated: nothing written)");
} else {
  writeFileSync(join(ML_DIR, "model.artifact.v4-nov.json"), JSON.stringify(candidate, null, 2));
  writeFileSync(join(ML_DIR, "RETRAIN_NOV_REPORT.md"), report.join("\n") + "\n");
  console.log("\nWrote src/ml/model.artifact.v4-nov.json and src/ml/RETRAIN_NOV_REPORT.md (the live model is untouched).");
}
