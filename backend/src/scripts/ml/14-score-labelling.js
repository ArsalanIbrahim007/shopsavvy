// 14-score-labelling.js — reads the labelling sheets of the 2026-11-18 round back (13-mine-labelling-pairs.js wrote them), measures how
// often two people agree (Cohen's kappa on the pairs two of them labelled), and writes the labels.
//
//   node src/scripts/ml/14-score-labelling.js ["<sheet folder>"] ["<output file>"]   default: ..\..\labelling, and the dataset file below
//
// In the sheet folder: sheet-<name>.csv as returned (Excel may save them with ";" and quotes; both are read), and optionally
// resolutions.csv (pair_id,label) settling the pairs two people disagreed on, after they have discussed them.
// Writes src/ml/dataset/pairs_nov18.labeled.json: every pair with label 1 (same) / 0 (different) / null (unsure, unlabelled, or a
// disagreement not yet settled), who labelled it, and whether it is sealed. Kappa is computed on the labels as first given, before
// any resolution, which is what it is meant to measure.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATASET = join(here, "..", "..", "ml", "dataset");

/** One CSV text to rows of cells: quotes, doubled quotes, a BOM, CRLF, and "," or ";" (whichever the header uses). */
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "Same", " same ", "S", "1" -> 1; "different", "diff", "d", "0" -> 0; "unsure", "?", "u" -> "unsure"; empty -> null. */
export function readLabel(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["same", "s", "1", "yes", "y"].includes(v)) return 1;
  if (["different", "diff", "d", "0", "no", "n"].includes(v)) return 0;
  if (["unsure", "u", "?", "not sure"].includes(v)) return "unsure";
  return "invalid";
}

/** Cohen's kappa for two raters' labels over the same items (values compared as they are). Null with no items. */
export function cohensKappa(pairs) {
  const n = pairs.length;
  if (n === 0) return null;
  const values = [...new Set(pairs.flat())];
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const expected = values.reduce((sum, v) => sum + (pairs.filter(([a]) => a === v).length / n) * (pairs.filter(([, b]) => b === v).length / n), 0);
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

/** The sheets' answers: pairId -> { name: label }, plus problems (invalid labels, unknown pair ids). */
export function readSheets(folder, names, knownIds) {
  const answers = new Map();
  const problems = [];
  for (const name of names) {
    const file = join(folder, `sheet-${name}.csv`);
    if (!existsSync(file)) { problems.push(`${name}: sheet not found`); continue; }
    const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
    const idCol = header.findIndex((h) => /pair_id/i.test(h));
    const labelCol = header.findIndex((h) => /^label/i.test(h.trim()));
    if (idCol < 0 || labelCol < 0) { problems.push(`${name}: no pair_id or label column`); continue; }
    for (const row of rows) {
      const id = row[idCol]?.trim();
      if (!knownIds.has(id)) { problems.push(`${name}: unknown pair ${id}`); continue; }
      const label = readLabel(row[labelCol]);
      if (label === "invalid") problems.push(`${name}: ${id} has label "${row[labelCol]}"`);
      if (!answers.has(id)) answers.set(id, {});
      answers.get(id)[name] = label === "invalid" ? null : label;
    }
  }
  return { answers, problems };
}

async function main() {
  const folder = resolve(process.argv[2] || join(here, "..", "..", "..", "..", "..", "labelling"));
  const outFile = process.argv[3] ? resolve(process.argv[3]) : join(DATASET, "pairs_nov18.labeled.json"); // a trial run writes elsewhere
  const raw = JSON.parse(readFileSync(join(DATASET, "pairs_nov18.raw.json"), "utf8"));
  const names = [...new Set(raw.pairs.flatMap((p) => p.labellers))];
  const { answers, problems } = readSheets(folder, names, new Set(raw.pairs.map((p) => p.pairId)));
  problems.forEach((p) => console.log(`! ${p}`));

  // Agreement on the double-labelled pairs, before any resolution.
  const double = raw.pairs.filter((p) => p.labellers.length === 2);
  const both = double.map((p) => [p, p.labellers.map((n) => answers.get(p.pairId)?.[n] ?? null)]).filter(([, [a, b]]) => a !== null && b !== null);
  const k3 = cohensKappa(both.map(([, ab]) => ab));
  const sameDiff = both.filter(([, [a, b]]) => a !== "unsure" && b !== "unsure");
  const k2 = cohensKappa(sameDiff.map(([, ab]) => ab));
  const agree = both.filter(([, [a, b]]) => a === b).length;
  console.log(`\nDouble-labelled: ${double.length} pairs, ${both.length} answered by both. Agreement ${agree} of ${both.length}` +
    (both.length ? ` (${((100 * agree) / both.length).toFixed(1)}%)` : "") +
    `; Cohen's kappa ${k3 === null ? "n/a" : k3.toFixed(3)} (same/different/unsure), ${k2 === null ? "n/a" : k2.toFixed(3)} on the ${sameDiff.length} where neither said unsure.`);
  for (const [x, y] of [[names[0], names[1]], [names[0], names[2]], [names[1], names[2]]]) {
    const pairs = both.filter(([p]) => p.labellers.includes(x) && p.labellers.includes(y)).map(([p]) => [answers.get(p.pairId)[x], answers.get(p.pairId)[y]]);
    const k = cohensKappa(pairs);
    console.log(`  ${x} and ${y}: ${pairs.length} pairs, kappa ${k === null ? "n/a" : k.toFixed(3)}`);
  }

  // Resolutions of disagreements (after discussion).
  const resolutions = new Map();
  const resFile = join(folder, "resolutions.csv");
  if (existsSync(resFile)) {
    const [header, ...rows] = parseCsv(readFileSync(resFile, "utf8"));
    const idCol = header.findIndex((h) => /pair_id/i.test(h));
    const labelCol = header.findIndex((h) => /label/i.test(h));
    for (const row of rows) resolutions.set(row[idCol]?.trim(), readLabel(row[labelCol]));
  }
  const disagreements = both.filter(([, [a, b]]) => a !== b).map(([p]) => p);
  const open = disagreements.filter((p) => !resolutions.has(p.pairId));
  if (disagreements.length) {
    console.log(`\nDisagreements: ${disagreements.length} (settled in resolutions.csv: ${disagreements.length - open.length}). Still to settle:`);
    for (const p of open) console.log(`  ${p.pairId} [${p.categoryA}] ${p.labellers.map((n) => `${n}: ${answers.get(p.pairId)[n]}`).join(", ")} | ${p.titleA.slice(0, 50)} || ${p.titleB.slice(0, 50)}`);
  }

  const labeled = raw.pairs.map((p) => {
    const given = p.labellers.map((n) => answers.get(p.pairId)?.[n] ?? null);
    const known = given.filter((v) => v !== null);
    let label = null;
    let source = "unlabelled";
    if (resolutions.has(p.pairId)) { label = resolutions.get(p.pairId); source = "resolved after discussion"; }
    else if (known.length && known.every((v) => v === known[0])) { label = known[0]; source = known.length === 2 ? "two labellers agree" : "one labeller"; }
    else if (known.length) source = "disagreement, not settled";
    return { ...p, given: Object.fromEntries(p.labellers.map((n, i) => [n, given[i]])), label: label === 0 || label === 1 ? label : null, labelSource: label === "unsure" ? "unsure" : source };
  });
  const usable = labeled.filter((p) => p.label !== null);
  writeFileSync(outFile, JSON.stringify({
    createdAt: new Date().toISOString(), kappa: { sameDifferentUnsure: k3, sameDifferent: k2, pairs: both.length, agree },
    counts: { pairs: labeled.length, labelled: usable.length, same: usable.filter((p) => p.label === 1).length, different: usable.filter((p) => p.label === 0).length,
      sealedLabelled: usable.filter((p) => p.sealed).length },
    pairs: labeled,
  }, null, 1));
  const byCat = {};
  for (const p of usable) { byCat[p.categoryA] ??= { same: 0, different: 0 }; byCat[p.categoryA][p.label ? "same" : "different"]++; }
  console.log(`\nLabelled ${usable.length} of ${labeled.length} (same ${usable.filter((p) => p.label === 1).length}, different ${usable.filter((p) => p.label === 0).length}); sealed and labelled ${usable.filter((p) => p.sealed).length}.`);
  console.log(Object.entries(byCat).map(([c, v]) => `${c} ${v.same}/${v.different}`).join(", "), "(same/different)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
