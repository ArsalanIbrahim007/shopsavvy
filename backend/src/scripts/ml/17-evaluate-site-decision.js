// 17-evaluate-site-decision.js — the site's whole decision for a pair of listings, scored on labelled pairs no model trained on.
//
// 15-retrain-nov.js scores the classifier behind the attribute veto. On the site a listing joins another's group through more than
// that (similarityModel.service.js mlMatchStrategy and the grouping's last passes):
//   - the veto (attributeConflict, prefixConflict), then a shared model code, then the classifier, with a price check when only one
//     title states a capacity;
//   - the same filler-free words as the other listing (with the same price check);
//   - the same model code at the end of grouping (sameModel), and the same titles once store wording is removed (samePlainTitles).
// This script asks exactly those functions, with each listing as a group of one, in both orders (grouping meets them in either).
// Nothing is tuned here: it measures the decision the site already makes, once with each model.
//
// Usage: node src/scripts/ml/17-evaluate-site-decision.js [candidate=model.artifact.v4-nov.json]
// Output: prints, and writes src/ml/SITE_DECISION_REPORT.md

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const ML_DIR = join(dirname(__filename), "..", "..", "ml");
const SHEETS_DIR = "D:/FYP PROJECT/labelling";

function parseCsv(text) {
  const out = [];
  let row = [], f = "", q = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x)) out.push(row); row = []; }
    else f += c;
  }
  row.push(f);
  if (row.some((x) => x)) out.push(row);
  return out;
}

/** The sealed November pairs with their final labels (agreed, or settled in resolve-disputes.csv); unsure ones left out. */
function sealedPairs() {
  const marks = {};
  for (const file of ["sheet-Arsalan.csv", "sheet-Abuzar.csv", "sheet-Muzammil.csv", "resolve-disputes.csv"]) {
    const rows = parseCsv(readFileSync(join(SHEETS_DIR, file), "utf8"));
    const L = rows[0].findIndex((h) => h.trim().startsWith("label"));
    for (const r of rows.slice(1)) (marks[r[0].trim()] ??= {})[file] = r[L].trim().toLowerCase();
  }
  const final = (id) => {
    const m = marks[id] ?? {};
    if (m["resolve-disputes.csv"]) return m["resolve-disputes.csv"];
    const v = Object.values(m).filter(Boolean);
    return v.length && v.every((x) => x === v[0]) ? v[0] : null;
  };
  const raw = JSON.parse(readFileSync(join(ML_DIR, "dataset", "pairs_nov18.raw.json"), "utf8")).pairs;
  return raw.filter((p) => p.sealed).map((p) => ({ ...p, label: { same: 1, different: 0 }[final(p.pairId)] })).filter((p) => p.label !== undefined);
}

if (process.argv[2] === "--child") {
  // Child: the model SHOPSAVVY_MATCH_MODEL names is loaded by similarityModel.service.js; print predictions as JSON.
  const { mlMatchStrategy, classifyPairML } = await import("../../services/similarityModel.service.js");
  const { attributeConflict } = await import("../../services/similarity.service.js");
  const sets = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const asGroup = (item) => ({ rawGroupKey: item.title, lowestPrice: item.price, highestPrice: item.price, offers: [item] });
  const site = (p) => {
    const a = { title: p.titleA, price: Number(p.priceA) || 0 }, b = { title: p.titleB, price: Number(p.priceB) || 0 };
    if (attributeConflict(a.title, b.title, { ignoreUnstatedStorage: true })) return 0; // the grouping loop's own conflict check
    return mlMatchStrategy(a.title, asGroup(b), a) || mlMatchStrategy(b.title, asGroup(a), b) || Boolean(mlMatchStrategy.sameModel(a, b)) || mlMatchStrategy.samePlainTitles(a, b) ? 1 : 0;
  };
  const classifierOnly = (p) => (classifyPairML({ title: p.titleA, price: Number(p.priceA) || 0 }, { title: p.titleB, price: Number(p.priceB) || 0 }).isMatch ? 1 : 0);
  const out = {};
  for (const [name, pairs] of Object.entries(sets)) out[name] = { site: pairs.map(site), classifier: classifierOnly && pairs.map(classifierOnly) };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const candidate = process.argv[2] || "model.artifact.v4-nov.json";
const { test, evalOnly } = JSON.parse(readFileSync(join(ML_DIR, "dataset", "split.json"), "utf8"));
// The earlier 164-pair set less the 16 pairs the live model was trained on (dataset/live_model_training_pairs.json, its training
// split at commit 0effc7c): the 148 pairs the live model never saw.
const pairKey = (p) => [p.idA, p.idB].sort().join("|");
const liveTrained = new Set(JSON.parse(readFileSync(join(ML_DIR, "dataset", "live_model_training_pairs.json"), "utf8")).pairs.map(pairKey));
const old164 = [...test, ...evalOnly];
const sets = { sealed: sealedPairs(), old164, unseen148: old164.filter((p) => !liveTrained.has(pairKey(p))) };
const setsFile = join(ML_DIR, "dataset", ".site-decision-sets.tmp.json");
writeFileSync(setsFile, JSON.stringify(sets));
const predict = (model) => JSON.parse(execFileSync(process.execPath, [__filename, "--child", setsFile], { env: { ...process.env, SHOPSAVVY_MATCH_MODEL: model }, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString());
const runs = [["Live model (v1)", predict("model.artifact.json")], [`Candidate (${candidate})`, predict(candidate)]];

const pct = (x) => `${(100 * x).toFixed(1)}%`;
function metrics(pairs, preds) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  pairs.forEach((p, i) => { if (preds[i] && p.label) tp++; else if (preds[i]) fp++; else if (p.label) fn++; else tn++; });
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, tn, accuracy: (tp + tn) / pairs.length, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}
function interval(pairs, preds) {
  let s = 20261120;
  const rng = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const f1s = [];
  for (let b = 0; b < 2000; b++) {
    let tp = 0, fp = 0, fn = 0;
    for (let k = 0; k < pairs.length; k++) { const i = Math.floor(rng() * pairs.length); if (preds[i] && pairs[i].label) tp++; else if (preds[i]) fp++; else if (pairs[i].label) fn++; }
    f1s.push(tp ? (2 * tp) / (2 * tp + fp + fn) : 0);
  }
  f1s.sort((a, b) => a - b);
  return `${pct(f1s[50])} to ${pct(f1s[1949])}`;
}

const lines = [
  "# The site's decision for a pair, on labelled pairs no model trained on",
  "",
  `Generated ${new Date().toISOString()} by \`src/scripts/ml/17-evaluate-site-decision.js\`. "Site decision" is every check the site uses to`,
  "put two listings in one product (veto, shared model code, classifier, same filler-free words, same model, same titles without",
  'store wording), asked of each pair in both orders. "Classifier step" is the veto, shared model code and classifier only.',
  "Nothing was tuned for this: the same functions the live site runs, with each model.",
  "",
];
const { isSimilarProduct } = await import("../../services/similarity.service.js");
const isSimilarRule = (p) => isSimilarProduct(p.titleA, p.titleB, 0.7);
const rulePreds = Object.fromEntries(Object.entries(sets).map(([k, pairs]) => [k, pairs.map((p) => (isSimilarRule(p) ? 1 : 0))]));
for (const [setName, title] of [["sealed", "Sealed November test set"], ["unseen148", "Earlier pairs the live model never saw (164 less the 16 it was trained on)"], ["old164", "Earlier 164-pair evaluation set (16 of these were in the live model's training data)"]]) {
  const pairs = sets[setName];
  lines.push(`## ${title} (${pairs.length} pairs, ${pairs.filter((p) => p.label === 1).length} same)`, "",
    "| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |", "|---|---|---|---|---|---|---|");
  for (const kind of ["site", "classifier"]) {
    for (const [name, preds] of runs) {
      const m = metrics(pairs, preds[setName][kind]);
      lines.push(`| ${kind === "site" ? "Site decision" : "Classifier step"} | ${name} | ${pct(m.accuracy)} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} (${interval(pairs, preds[setName][kind])}) | ${m.tp} / ${m.fp} / ${m.fn} |`);
    }
  }
  const r = metrics(pairs, rulePreds[setName]);
  lines.push(`| Rule baseline | Word overlap (Jaccard >= 0.70) | ${pct(r.accuracy)} | ${pct(r.precision)} | ${pct(r.recall)} | ${pct(r.f1)} (${interval(pairs, rulePreds[setName])}) | ${r.tp} / ${r.fp} / ${r.fn} |`);
  lines.push("");
}
writeFileSync(join(ML_DIR, "SITE_DECISION_REPORT.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
