// evaluationReport.service.js — the accuracy numbers of the two trained models, read from the evaluation reports the
// team's own scripts write (src/ml/EVALUATION_REPORT.md and src/ml/discount/EVALUATION_REPORT.md), so the page that shows
// them cannot drift from the reports: re-running an evaluation script changes what is shown. A report that cannot be read or
// no longer has the expected shape gives null for that model; nothing is ever filled in from memory.
//
// Parsing is deliberately narrow: only the lines these numbers come from are read.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ML_DIR = join(here, "..", "ml");

const GENERATED = /Generated (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/;

const percent = (text) => {
  const match = /(-?\d+(?:\.\d+)?)\s*%/.exec(String(text ?? ""));
  return match ? Number(match[1]) : null;
};

const cells = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim());

/** The lines of one "## " section of a markdown report, without the heading. */
function section(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start < 0) return null;
  const rest = text.slice(start + heading.length + 3);
  const end = rest.search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, end)).split("\n");
}

/**
 * The matching classifier: how the model in use, and the plain rule it replaced, did on pairs of listings that were labelled
 * by hand and never used for training.
 * @param {string} report  the text of src/ml/EVALUATION_REPORT.md
 * @returns {{generatedAt: string|null, heldOutPairs: number, models: object} | null}
 */
export function parseMatcherReport(report) {
  const lines = section(String(report ?? ""), "Production model vs candidate");
  if (!lines) return null;

  const pairs = /On the (\d+) held-out pairs/.exec(lines.join(" "))?.[1];
  const row = (label) => {
    const line = lines.find((l) => l.startsWith(`| ${label}`));
    if (!line) return null;
    const values = cells(line).slice(1).map(percent);
    if (values.length !== 4 || values.some((v) => v === null)) return null;
    const [accuracy, precision, recall, f1] = values;
    return { accuracy, precision, recall, f1 };
  };

  const production = row("Production model");
  const rule = row("Rule baseline");
  if (!pairs || !production || !rule) return null;

  return {
    generatedAt: GENERATED.exec(report)?.[1] ?? null,
    heldOutPairs: Number(pairs),
    models: { production, candidate: row("Candidate"), rule },
  };
}

/**
 * The cross-store discount detector (Isolation Forest): how many claims it can judge, how many real claims it flags, and how many
 * invented ones it catches at several sizes of invented mark-up, at the threshold in use.
 * @param {string} report  the text of src/ml/discount/EVALUATION_REPORT.md
 * @param {number} threshold  the threshold the model in use applies
 */
export function parseDiscountReport(report, threshold) {
  const text = String(report ?? "");
  const claims = /have at least one other store to compare against: \*\*(\d+)\*\*/.exec(text)?.[1];
  const history = /only \*\*(\d+)\*\* \(([\d.]+)%\)/.exec(text);
  const splits = /Averaged over (\d+) independent/.exec(text)?.[1];

  const key = String(threshold);
  const line = text.split("\n").find((l) => l.startsWith(`| Isolation Forest, score >= ${key} |`));
  if (!claims || !history || !line) return null;
  const values = cells(line).slice(1).map(percent);
  if (values.length !== 5 || values.some((v) => v === null)) return null;
  const [flaggedReal, caught13, caught15, caught175, caught2] = values;

  return {
    generatedAt: GENERATED.exec(text)?.[1] ?? null,
    judgeableClaims: Number(claims),
    historyRuleJudged: Number(history[1]),
    historyRuleShare: Number(history[2]),
    splits: splits ? Number(splits) : null,
    threshold: Number(threshold),
    flaggedRealClaims: flaggedReal,
    caughtInvented: { "1.3x": caught13, "1.5x": caught15, "1.75x": caught175, "2x": caught2 },
  };
}

const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

let cached = null;

/** Both models' numbers with the facts about the model files in use. Read once per process. */
export function readEvaluation() {
  if (cached) return cached;

  const matcherArtifact = readJson(join(ML_DIR, process.env.SHOPSAVVY_MATCH_MODEL || "model.artifact.json"));
  const matcher = parseMatcherReport(read(join(ML_DIR, "EVALUATION_REPORT.md")));

  const discountArtifact = readJson(join(ML_DIR, "discount", "model.artifact.json"));
  const discount = discountArtifact ? parseDiscountReport(read(join(ML_DIR, "discount", "EVALUATION_REPORT.md")), discountArtifact.threshold) : null;

  cached = {
    matcher: matcher && matcherArtifact
      ? { ...matcher, trainingPairs: matcherArtifact.trainingSize ?? null, trainedAt: matcherArtifact.trainedAt ?? null }
      : null,
    discount: discount && discountArtifact ? { ...discount, trainingRows: discountArtifact.trainingRows ?? null, trainedAt: discountArtifact.trainedAt ?? null } : null,
  };
  return cached;
}

/** For tests. */
export function clearEvaluationCache() {
  cached = null;
}
