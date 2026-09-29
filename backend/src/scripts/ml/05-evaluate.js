// 05-evaluate.js — evaluates the trained classifier against the held-out
// test set PLUS the eval-only pools (hard_negative_veto,
// easy_negative_cross_category -- never trained on), and runs the existing
// rule-based pipeline over the identical set for a direct comparison. This
// is the concrete evidence for "here is our dataset, here is our train/test
// split, here is our model's accuracy vs. the old rule's accuracy on the
// same test set."
//
// Also reports:
//   - a per-category breakdown, so a strong phone score cannot hide a weak
//     laptop or TV score;
//   - the previous, phone-heavy model (model.artifact.v1-phone-heavy.json)
//     scored on the pairs mined for the newer categories, which it never saw,
//     to show what the extra data changed.
//
// Hand-written commentary lives in EVALUATION_NOTES.md and is appended
// verbatim, so regenerating this report cannot delete it.
//
// Usage: node src/scripts/ml/05-evaluate.js [candidateArtifactFile]
// Output: prints metrics, writes src/ml/EVALUATION_REPORT.md

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { buildFeatureVector } from "../../ml/features.js";
import { predictProba } from "../../ml/logisticRegression.js";
import { isSimilarProduct, attributeConflict } from "../../services/similarity.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");
const ML_DIR = join(__dirname, "..", "..", "ml");

const { train, test, evalOnly, meta } = JSON.parse(readFileSync(join(DATASET_DIR, "split.json"), "utf8"));
// The model the live API loads, and a retrained candidate that is evaluated here but
// only promoted after whole-database review (see EVALUATION_NOTES.md).
const v1Model = JSON.parse(readFileSync(join(ML_DIR, "model.artifact.json"), "utf8"));
const CANDIDATE_FILE = process.argv[2] || "model.artifact.v3-hardneg.json";
const model = JSON.parse(readFileSync(join(ML_DIR, CANDIDATE_FILE), "utf8"));

const evaluationSet = [...test, ...evalOnly];

function classifyWith(artifact) {
  return (pair) => {
    // The attribute-constraint veto is an absolute pre-filter, not a model
    // input -- a known fact like "128GB and 64GB are different" is never left
    // to the model to overrule. The lenient veto (ignoreUnstatedStorage)
    // mirrors how the model was trained: unstated-capacity cases are exactly
    // what it is meant to adjudicate, using priceProximity as a learned
    // signal instead of the rule pipeline's fixed 15% cutoff.
    if (attributeConflict(pair.titleA, pair.titleB, { ignoreUnstatedStorage: true })) return 0;

    const features = buildFeatureVector({ titleA: pair.titleA, titleB: pair.titleB, priceA: pair.priceA, priceB: pair.priceB }, artifact.featureNames);
    return predictProba(features, artifact) >= artifact.threshold ? 1 : 0;
  };
}

const classifyML = classifyWith(model);
const classifyV1 = classifyWith(v1Model);
const classifyRule = (pair) => (isSimilarProduct(pair.titleA, pair.titleB, 0.7) ? 1 : 0);

function confusionMatrix(pairs, classify) {
  const cm = { tp: 0, fp: 0, fn: 0, tn: 0 };
  pairs.forEach((p) => {
    const predicted = classify(p);
    if (p.label === 1 && predicted === 1) cm.tp++;
    else if (p.label === 0 && predicted === 1) cm.fp++;
    else if (p.label === 1 && predicted === 0) cm.fn++;
    else cm.tn++;
  });
  return cm;
}

function metricsFrom(cm) {
  const total = cm.tp + cm.tn + cm.fp + cm.fn;
  const accuracy = total === 0 ? 0 : (cm.tp + cm.tn) / total;
  const precision = cm.tp + cm.fp === 0 ? 0 : cm.tp / (cm.tp + cm.fp);
  const recall = cm.tp + cm.fn === 0 ? 0 : cm.tp / (cm.tp + cm.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { accuracy, precision, recall, f1 };
}

const mlCm = confusionMatrix(evaluationSet, classifyML);
const ruleCm = confusionMatrix(evaluationSet, classifyRule);
const mlMetrics = metricsFrom(mlCm);
const ruleMetrics = metricsFrom(ruleCm);

console.log(`Evaluation set: ${evaluationSet.length} pairs (${test.length} held-out test + ${evalOnly.length} eval-only, never trained on)`);
console.log("\n=== Candidate classifier ===");
console.table(mlCm);
console.table(mlMetrics);
console.log("\n=== Rule-based baseline (isSimilarProduct, threshold 0.7) ===");
console.table(ruleCm);
console.table(ruleMetrics);

const pct = (n) => `${(n * 100).toFixed(1)}%`;

// Per-category breakdown on the held-out test pairs (eval-only pairs are
// veto/cross-category checks and are not attributed to a category here).
const categories = [...new Set(test.map((p) => p.categoryA || "other"))].sort();
const perCategory = categories.map((category) => {
  const pairs = test.filter((p) => (p.categoryA || "other") === category);
  const m = metricsFrom(confusionMatrix(pairs, classifyML));
  const r = metricsFrom(confusionMatrix(pairs, classifyRule));
  const positives = pairs.filter((p) => p.label === 1).length;
  return { category, pairs: pairs.length, positives, ml: m, rule: r };
});

// The production model against the pairs mined for the newer categories. None
// of these were in its training data, so this is a fair before/after.
const newCategoryTest = test.filter((p) => /^cat_/.test(p.pool));
const v1OnNew = metricsFrom(confusionMatrix(newCategoryTest, classifyV1));
const v2OnNew = metricsFrom(confusionMatrix(newCategoryTest, classifyML));
const ruleOnNew = metricsFrom(confusionMatrix(newCategoryTest, classifyRule));

console.log("\n=== Per category (held-out test pairs) ===");
console.table(perCategory.map((c) => ({
  category: c.category, pairs: c.pairs, positives: c.positives,
  mlF1: pct(c.ml.f1), ruleF1: pct(c.rule.f1), mlAcc: pct(c.ml.accuracy),
})));
console.log(`\nNewer categories only (${newCategoryTest.length} held-out pairs): production v1 F1 ${pct(v1OnNew.f1)}, candidate F1 ${pct(v2OnNew.f1)}, rule F1 ${pct(ruleOnNew.f1)}`);

const disagreementsAll = evaluationSet
  .map((p) => ({ ...p, mlPred: classifyML(p), rulePred: classifyRule(p) }))
  .filter((p) => p.mlPred !== p.rulePred);
const disagreements = disagreementsAll.slice(0, 10);
const mlErrors = evaluationSet
  .map((p) => ({ ...p, mlPred: classifyML(p) }))
  .filter((p) => p.mlPred !== p.label);

console.log(`\nDisagreements (ML vs rule): ${disagreementsAll.length} of ${evaluationSet.length}`);
console.log(`ML errors: ${mlErrors.length}`);

const trainPositive = meta.counts.trainPositive;
const trainNegative = meta.counts.trainNegative;
const testPositive = meta.counts.testPositive;
const testNegative = meta.counts.testNegative;
const label = (v) => (v ? "match" : "no-match");

const notesPath = join(ML_DIR, "EVALUATION_NOTES.md");
const notes = existsSync(notesPath) ? readFileSync(notesPath, "utf8") : "";

const report = `# Trained Matching Classifier — Evaluation Report

Generated ${new Date().toISOString()}. Pairs are mined from the live listing database, blocked
by category (never all-pairs), labelled by hand against a written rubric
(\`dataset/LABELING_RUBRIC.md\`) before any model output was consulted, with a 20-pair
independent spot-check per labelling round. Train/test split seed: ${meta.seed}.

## Dataset composition

| Split | Positive | Negative | Total |
|---|---|---|---|
| Train | ${trainPositive} | ${trainNegative} | ${trainPositive + trainNegative} |
| Test (held out) | ${testPositive} | ${testNegative} | ${testPositive + testNegative} |
| Eval-only (never trained on: hard vetoes + cross-category) | 0 | ${meta.counts.evalOnly} | ${meta.counts.evalOnly} |

The first dataset was 181 pairs and about 60% smartphones: laptops had no positive pairs,
smartwatches none, TVs six. A second mining pass added 150 pairs across laptops, TVs,
smartwatches, tablets and headphones, so the classifier is now trained and tested outside
phones. A third pass (\`06-mine-disagreements.js\`) added 199 pairs taken from where two models
disagreed about the live catalogue, mostly near-identical titles that name different models
(Reno 5K/5Z, ThinkBook G8/G9): 167 of them are different products, which is the class the
earlier data lacked. Class-weighted training is used rather than artificially balancing the data.

**The split is grouped, not random.** Pairs are split as whole groups: any two pairs that share
a listing or a product family go to the same side, then each category contributes about a
quarter of its pairs to the test set. This is checked: no listing and no product family
appears on both sides. (An earlier random split let several pairs about one product straddle
train and test, which flatters the score.)

## Results on the ${evaluationSet.length}-pair evaluation set (test + eval-only, none trained on)

| Metric | Candidate classifier (${CANDIDATE_FILE}) | Rule baseline (Jaccard ≥ 0.70) |
|---|---|---|
| Accuracy | ${pct(mlMetrics.accuracy)} | ${pct(ruleMetrics.accuracy)} |
| Precision | ${pct(mlMetrics.precision)} | ${pct(ruleMetrics.precision)} |
| Recall | ${pct(mlMetrics.recall)} | ${pct(ruleMetrics.recall)} |
| F1 | ${pct(mlMetrics.f1)} | ${pct(ruleMetrics.f1)} |

### Confusion matrix — candidate classifier
| | Predicted match | Predicted no-match |
|---|---|---|
| **Actually match** | ${mlCm.tp} (TP) | ${mlCm.fn} (FN) |
| **Actually no-match** | ${mlCm.fp} (FP) | ${mlCm.tn} (TN) |

### Confusion matrix — rule baseline
| | Predicted match | Predicted no-match |
|---|---|---|
| **Actually match** | ${ruleCm.tp} (TP) | ${ruleCm.fn} (FN) |
| **Actually no-match** | ${ruleCm.fp} (FP) | ${ruleCm.tn} (TN) |

Both pipelines run behind the same attribute-constraint veto (\`attributeConflict\`) — the
comparison isolates the effect of replacing the fixed 0.70 Jaccard threshold with a trained
decision, not the constraint layer itself, which stays identical in both.

## By category (held-out test pairs only)

| Category | Pairs | Same-product pairs | Classifier F1 | Rule F1 | Classifier accuracy |
|---|---|---|---|---|---|
${perCategory.map((c) => `| ${c.category} | ${c.pairs} | ${c.positives} | ${c.positives ? pct(c.ml.f1) : "n/a"} | ${c.positives ? pct(c.rule.f1) : "n/a"} | ${pct(c.ml.accuracy)} |`).join("\n")}

F1 is shown as n/a where a category has no same-product test pairs. Small per-category counts
mean single pairs move these numbers a lot; read them as a check that no category collapses,
not as precise estimates.

## Production model vs candidate

On the ${newCategoryTest.length} held-out pairs from the newer categories (laptops, TVs, smartwatches, tablets,
headphones), which the production model never saw in training:

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Production model (v1, phone-heavy, ${v1Model.trainingSize} training pairs, threshold ${v1Model.threshold}) | ${pct(v1OnNew.accuracy)} | ${pct(v1OnNew.precision)} | ${pct(v1OnNew.recall)} | ${pct(v1OnNew.f1)} |
| Candidate (${CANDIDATE_FILE}, ${model.trainingSize} training pairs, threshold ${model.threshold}) | ${pct(v2OnNew.accuracy)} | ${pct(v2OnNew.precision)} | ${pct(v2OnNew.recall)} | ${pct(v2OnNew.f1)} |
| Rule baseline | ${pct(ruleOnNew.accuracy)} | ${pct(ruleOnNew.precision)} | ${pct(ruleOnNew.recall)} | ${pct(ruleOnNew.f1)} |

## Learned weights of the candidate (standardized scale)

| Feature | Weight |
|---|---|
${model.featureNames.map((name, i) => `| ${name} | ${model.weights[i].toFixed(4)} |`).join("\n")}
| *(bias)* | ${model.bias.toFixed(4)} |

## Where the two pipelines disagree (first ${disagreements.length} of ${disagreementsAll.length})

${disagreements.map((p) => `- **"${p.titleA}"** vs **"${p.titleB}"** — true label: ${label(p.label)}, ML said ${label(p.mlPred)}, rule said ${label(p.rulePred)}. (${p.rationale})`).join("\n")}

## Where the candidate is wrong (${mlErrors.length} of ${evaluationSet.length})

${mlErrors.length ? mlErrors.map((p) => `- **"${p.titleA}"** (${p.priceA}) vs **"${p.titleB}"** (${p.priceB}) — true label: ${label(p.label)}, ML said ${label(p.mlPred)}. (${p.rationale})`).join("\n") : "None."}

${notes}`;

writeFileSync(join(ML_DIR, "EVALUATION_REPORT.md"), report);
console.log(`\nWrote ${join(ML_DIR, "EVALUATION_REPORT.md")}`);
