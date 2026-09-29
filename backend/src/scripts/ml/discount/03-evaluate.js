// 03-evaluate.js — held-out evaluation of the cross-store discount anomaly
// detector, written to src/ml/discount/EVALUATION_REPORT.md.
//
// Isolation Forest is unsupervised and there is no ground-truth set of fake
// discounts, so evaluation uses the standard approach for anomaly detectors:
//   1. Hold out 25% of real rows; train a fresh forest on the other 75%.
//   2. False-flag rate: share of real held-out claims flagged. This is an
//      UPPER bound on false positives, since some real claims are genuinely
//      inflated.
//   3. Synthetic injection: inflate held-out claims' "original price" to a
//      known multiple of the market price and measure how many are caught.
//   4. Compare against a one-line rule baseline, so the model has to earn its
//      place against something simple.
//
// Usage: node src/scripts/ml/discount/03-evaluate.js

import fs from "node:fs";
import { trainIsolationForest, anomalyScore, createRng } from "../../../ml/isolationForest.js";
import { HYPERPARAMS, SCORE_THRESHOLD } from "../../../ml/discount/config.js";
import { matchesFakeDiscountPattern, MAX_PRICE_OVER_MARKET } from "../../../services/discountAnomaly.service.js";

const DATASET = new URL("../../../ml/discount/dataset.json", import.meta.url);
const ARTIFACT = new URL("../../../ml/discount/model.artifact.json", import.meta.url);
const REPORT = new URL("../../../ml/discount/EVALUATION_REPORT.md", import.meta.url);

const { rows, featureNames, builtAt } = JSON.parse(fs.readFileSync(DATASET, "utf8"));

// ── Synthetic positives ─────────────────────────────────────────────────
function featuresFor(price, original, marketMedian, marketMax) {
  return [
    Math.log(original / marketMedian),
    Math.log(original / marketMax),
    Math.log(price / marketMedian),
    (original - price) / original,
  ];
}

const INFLATIONS = [1.3, 1.5, 1.75, 2.0];

function inject(testRows, k) {
  return testRows
    .map((r) => {
      const { price, originalPrice, marketMedian, marketMax } = r.context;
      const fakeOriginal = marketMedian * k;
      // Only inject where it makes the claim *more* inflated than it already was.
      if (fakeOriginal <= price || fakeOriginal <= originalPrice) return null;
      return featuresFor(price, fakeOriginal, marketMedian, marketMax);
    })
    .filter(Boolean);
}

// ── Decision rules ──────────────────────────────────────────────────────
const RULE_RATIO = 1.2; // mirrors the 20% inflation threshold of the history-based rule
const ruleFlags = (x) => x[0] > Math.log(RULE_RATIO);

const pct = (v) => (Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(1)}%`);
const THRESHOLDS = [0.5, 0.52, 0.55, 0.58, 0.6, 0.65];

// With only ~66 held-out rows one row is 1.5%, so a single split is noisy.
// Average over several independent 75/25 splits instead.
const SPLIT_SEEDS = [2026, 11, 23, 37, 51];
const MAX_REAL_FLAG_RATE = 0.1; // conventional ~10% contamination budget

const sums = new Map(); // decision rule -> { realFlagged, caught_k... } summed over splits
let testSize = 0;
const injectedSizes = Object.fromEntries(INFLATIONS.map((k) => [k, 0]));

for (const seed of SPLIT_SEEDS) {
  const rng = createRng(seed);
  const shuffled = rows.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * 0.75);
  const train = shuffled.slice(0, cut);
  const test = shuffled.slice(cut);
  testSize = test.length;

  const model = trainIsolationForest(train.map((r) => r.features), HYPERPARAMS);
  const testX = test.map((r) => r.features);
  const injected = Object.fromEntries(INFLATIONS.map((k) => [k, inject(test, k)]));
  INFLATIONS.forEach((k) => { injectedSizes[k] += injected[k].length / SPLIT_SEEDS.length; });

  // Score each row once per split, then apply every threshold.
  const realScores = testX.map((x) => [anomalyScore(x, model), matchesFakeDiscountPattern(x)]);
  const injScores = Object.fromEntries(
    INFLATIONS.map((k) => [k, injected[k].map((x) => [anomalyScore(x, model), matchesFakeDiscountPattern(x)])])
  );
  const flagRate = (scored, t) => scored.filter(([s, dir]) => s >= t && dir).length / scored.length;

  const add = (name, values) => {
    const acc = sums.get(name) || {};
    for (const [key, v] of Object.entries(values)) acc[key] = (acc[key] || 0) + v / SPLIT_SEEDS.length;
    sums.set(name, acc);
  };

  for (const t of THRESHOLDS) {
    add(`Isolation Forest, score >= ${t}`, {
      threshold: t, // add() averages every key; averaging a constant leaves it unchanged
      realFlagged: flagRate(realScores, t),
      ...Object.fromEntries(INFLATIONS.map((k) => [`caught_${k}`, flagRate(injScores[k], t)])),
    });
  }
  add(`Baseline: original > ${RULE_RATIO} x market median`, {
    realFlagged: testX.filter(ruleFlags).length / testX.length,
    ...Object.fromEntries(INFLATIONS.map((k) => [`caught_${k}`, injected[k].filter(ruleFlags).length / injected[k].length])),
  });
}

const table = [...sums.entries()].map(([rule, v]) => ({ rule, ...v }));

// Threshold selection rule, stated up front rather than eyeballed: among
// thresholds that flag at most MAX_REAL_FLAG_RATE of real claims, take the one
// that catches the most synthetic fakes (summed across inflation levels).
const eligible = table.filter((r) => r.threshold !== undefined && r.realFlagged <= MAX_REAL_FLAG_RATE);
const recommended = eligible.sort(
  (a, b) =>
    INFLATIONS.reduce((s, k) => s + b[`caught_${k}`], 0) - INFLATIONS.reduce((s, k) => s + a[`caught_${k}`], 0)
)[0];

// ── Production model on the real data ──────────────────────────────────
const prod = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
const scored = rows
  .map((r) => ({ ...r, score: anomalyScore(r.features, prod) }))
  .sort((a, b) => b.score - a.score);
const prodFlagged = scored.filter((r) => r.score >= prod.threshold && matchesFakeDiscountPattern(r.features));

const ruleJudged = scored.filter((r) => ["likely_fake", "suspicious", "possibly_genuine", "genuine_discount"].includes(r.ruleClassification));
const ruleFake = ruleJudged.filter((r) => ["likely_fake", "suspicious"].includes(r.ruleClassification));
const ruleGenuine = ruleJudged.filter((r) => !["likely_fake", "suspicious"].includes(r.ruleClassification));
const flaggedSet = new Set(prodFlagged.map((r) => r.id));

// ── Console ─────────────────────────────────────────────────────────────
console.log(`Averaged over ${SPLIT_SEEDS.length} splits of ${rows.length - testSize} train / ${testSize} held-out. Avg injected positives per split: ${INFLATIONS.map((k) => `${k}x=${injectedSizes[k].toFixed(0)}`).join(", ")}`);
console.table(table.map((r) => ({
  rule: r.rule,
  "real flagged": pct(r.realFlagged),
  ...Object.fromEntries(INFLATIONS.map((k) => [`caught @${k}x`, pct(r[`caught_${k}`])])),
})));
console.log(`Recommended threshold (most fakes caught while flagging <= ${MAX_REAL_FLAG_RATE * 100}% of real claims): ${recommended?.threshold ?? "none qualifies"}`);
if (recommended && recommended.threshold !== SCORE_THRESHOLD) {
  console.log(`!! config.js SCORE_THRESHOLD is ${SCORE_THRESHOLD} -- update it and retrain so the deployed model uses the recommended value.`);
}
console.log(`Production model flags ${prodFlagged.length}/${rows.length} real claims at threshold ${prod.threshold}.`);
console.log(`Agreement with history-based rule where it could judge: flagged ${ruleFake.filter((r) => flaggedSet.has(r.id)).length}/${ruleFake.length} it called fake/suspicious, ${ruleGenuine.filter((r) => flaggedSet.has(r.id)).length}/${ruleGenuine.length} it called genuine.`);

// ── Report ──────────────────────────────────────────────────────────────
const row = (cells) => `| ${cells.join(" | ")} |`;
const md = [];
md.push("# Cross-store discount anomaly detector — evaluation report", "");
md.push(`Generated ${new Date().toISOString()} from the dataset built ${builtAt}. Regenerate with \`node src/scripts/ml/discount/03-evaluate.js\`.`, "");
md.push("## What it does", "");
md.push("A store claiming a discount shows a \"was\" price. A fake discount is a \"was\" price the product never really sold at. The history-based rule (`fakeDiscountScore.js`) can only judge a claim after it has seen at least 3 prices for that exact listing — true for very few listings. This model instead compares the claim against the **other stores selling the same product right now** (products grouped by the trained matcher), which needs no history at all.", "");
md.push(`Features (all scale-free ratios): ${featureNames.map((f) => `\`${f}\``).join(", ")}. Model: hand-rolled Isolation Forest (Liu, Ting & Zhou, 2008), ${HYPERPARAMS.trees} trees, subsample ${HYPERPARAMS.sampleSize}, seed ${HYPERPARAMS.seed}. A claim is flagged when its anomaly score is at least the threshold **and** it matches the fake-discount pattern: the claimed original price is above the highest price any other store currently charges, while the store's own current price is within ${Math.round((MAX_PRICE_OVER_MARKET - 1) * 100)}% of the market median. (Isolation Forest flags *any* unusual pattern; only this one is a fake-discount signal.)`, "");
md.push(`**Disclosed post-hoc refinement:** the ${Math.round((MAX_PRICE_OVER_MARKET - 1) * 100)}% current-price guard was added *after* inspecting the first version's flagged real claims. Several were stores whose current price was itself 1.5-2.5x the market with only a token discount (e.g. a 2TB phone grouped with cheaper variants) — a grouping error or plain overpricing, not evidence about the \"was\" price. In those cases the model now abstains (status \`not_comparable\`) rather than accusing the store. The synthetic fakes below leave the current price unchanged, so the guard has little effect on their detection rates; it mainly removes false flags on real data.`, "");
md.push("## Coverage", "");
md.push(`- Offers claiming a discount that have at least one other store to compare against: **${rows.length}**.`);
md.push(`- Of those, the history-based rule could reach a verdict on only **${ruleJudged.length}** (${pct(ruleJudged.length / rows.length)}); the rest were "unverified" for lack of history. This model scores all ${rows.length}.`, "");
md.push("## Held-out evaluation", "");
md.push(`Averaged over ${SPLIT_SEEDS.length} independent 75/25 splits (${rows.length - testSize} train / ${testSize} held out each) — with this few held-out rows a single split is too noisy (one row = ${pct(1 / testSize)}). Synthetic fake discounts were made by raising held-out claims' original price to ${INFLATIONS.join("x, ")}x the market median (only where that raised it). "Real claims flagged" is the share of held-out real claims flagged — an upper bound on the false-positive rate, since some real claims are themselves inflated.`, "");
md.push(row(["Decision rule", "Real claims flagged", ...INFLATIONS.map((k) => `Caught @ ${k}x`)]));
md.push(row(["---", "---", ...INFLATIONS.map(() => "---")]));
for (const r of table) md.push(row([r.rule, pct(r.realFlagged), ...INFLATIONS.map((k) => pct(r[`caught_${k}`]))]));
md.push("");
md.push(`**Threshold selection rule** (stated before looking at which value wins): among thresholds that flag at most ${MAX_REAL_FLAG_RATE * 100}% of real claims — the conventional ~10% contamination assumption for Isolation Forest — pick the one that catches the most synthetic fakes. That gives **${recommended?.threshold ?? "none"}**; deployed threshold: **${prod.threshold}**.`, "");
md.push("## Honest reading", "");
md.push("- The synthetic positives only change the original price, which is exactly the one feature the baseline rule looks at, so this test is structurally favourable to the baseline. The comparison is still worth showing because it answers the obvious panel question: *why a model instead of a threshold?*");
md.push("- The model's case is that it does not need a hand-picked constant: what counts as unusual is learned from how stores actually price, across several features jointly. Real stores routinely claim \"was\" prices above the market median (the median claim in this dataset already sits above it), so a fixed 20% rule flags a large share of ordinary claims — compare the two rows' real-flag rates above.");
md.push(`- Moderate inflation (1.3x-1.5x) is mostly **not** caught, and that is a property of the market, not a defect in the forest: ${pct(rows.filter((r) => r.features[0] > Math.log(1.3)).length / rows.length)} of real claims already sit more than 1.3x above the market median. Judged only against other stores, a 1.3x claim genuinely looks like everyone else's. Catching those needs a listing's own history, which is the history-based rule's job.`);
md.push("- It cannot tell a genuine launch price that has since fallen apart from an invented one; it only says the claim is not supported by today's market. That is why it runs **alongside** the history-based rule as extra evidence, and does not override it.");
md.push("- Grouping errors propagate: if the matcher wrongly places a more expensive variant with cheaper ones, its genuine original price can look inflated.", "");
md.push("## Agreement with the history-based rule", "");
md.push(`Where the history rule could judge (${ruleJudged.length} rows): the model flagged **${ruleFake.filter((r) => flaggedSet.has(r.id)).length} of ${ruleFake.length}** claims the rule called fake/suspicious, and **${ruleGenuine.filter((r) => flaggedSet.has(r.id)).length} of ${ruleGenuine.length}** it called genuine.`, "");
const maxOverMarket = ruleFake.length ? Math.max(...ruleFake.map((r) => Math.exp(r.features[1]) - 1)) : 0;
md.push(`This is expected, because the two answer different questions. The history rule asks *"did this store ever actually sell at its 'was' price?"*; this model asks *"is the 'was' price out of line with what the market charges today?"* None of the ${ruleFake.length} claims the history rule flagged is more than ${pct(maxOverMarket)} above the highest current market price — ordinary by market standards — while their own stores' past prices show they never sold that high. They are complementary: one catches a store misrepresenting its own past, the other catches claims far out of line with the market, and only the second works without history (all ${rows.length} claims today vs. ${ruleJudged.length} for the first).`, "");
md.push(`## Most anomalous real claims (production model, ${prodFlagged.length} flagged of ${rows.length})`, "");
md.push(row(["Score", "Store", "Price", "Claimed original", "Market median", "Other stores", "Title"]));
md.push(row(["---", "---", "---", "---", "---", "---", "---"]));
for (const r of prodFlagged.slice(0, 15)) {
  md.push(row([
    r.score.toFixed(3),
    r.platform,
    r.context.price.toLocaleString("en-US"),
    r.context.originalPrice.toLocaleString("en-US"),
    Math.round(r.context.marketMedian).toLocaleString("en-US"),
    r.context.comparators,
    r.title.replace(/\|/g, "/").slice(0, 70),
  ]));
}
md.push("");

fs.writeFileSync(REPORT, md.join("\n"));
console.log("Report written: src/ml/discount/EVALUATION_REPORT.md");
