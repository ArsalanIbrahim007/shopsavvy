// 02-train-evaluate.js — R2, step 2: train the 7-day drop forecast and test it against simple baselines.
//
// Two evaluations, both written to src/ml/forecast/FORECAST_REPORT.md:
//
//   strict       the one that counts. Split by date: the model is tested on the last TEST_DAYS days of samples, and trained only on
//                samples whose whole label week ended before those days (a 7-day horizon needs a 7-day gap, or the training labels
//                would contain the test period's prices). Needs enough history; until there is, the report says so and when it
//                will be possible, and no strict figure is given.
//   provisional  for now, while history is short. Listings are split at random (70% train, 30% test, seeded) and the time too:
//                train on the train listings' earlier days, test on the OTHER listings' later days. A listing's own future never
//                reaches training, but a sale that moved many prices of one store in the overlap can still be learnt from other
//                listings of that store, so these figures may be optimistic.
//
// The L2 strength is chosen by 3-fold cross-validation over listings within the training set (average precision). The model
// written to src/ml/forecast/model.artifact.json is trained on every sample there is, for use.
//
//   node src/scripts/ml/forecast/02-train-evaluate.js

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_NAMES, FORECAST } from "../../../ml/forecast/features.js";
import { atTop, auc, averagePrecision, brierSkill, clusterBootstrap, random } from "../../../ml/forecast/metrics.js";
import { predictProba, trainLogisticRegression } from "../../../ml/logisticRegression.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "ml", "forecast");
const STRICT = { testDays: 5, minTrain: 2000, minTrainDrops: 30, minTest: 1000, minTestDrops: 20 };
const PROVISIONAL = { testShare: 0.3, seed: 20261022 };
const L2_GRID = [0.001, 0.01, 0.1, 1];
const TRAIN = { epochs: 1500, lr: 0.2 };
const SHUFFLES = 20;

const data = JSON.parse(readFileSync(join(DIR, "dataset.json"), "utf8"));
const rows = data.rows.map(([listing, platform, category, day, label, ...features]) => ({ listing, platform, category, day, label, features }));
const dayDate = (day) => new Date(day * 86_400_000).toISOString().slice(0, 10);
const X = (set) => set.map((r) => r.features);
const y = (set) => set.map((r) => r.label);
const drops = (set) => set.filter((r) => r.label === 1).length;
const rate = (set) => drops(set) / set.length;
const feature = (name) => FEATURE_NAMES.indexOf(name);

/** L2 by 3-fold cross-validation over listings (average precision), then a model trained on all of `train`. */
function fitModel(train) {
  const fold = (listing) => listing % 3;
  const scored = L2_GRID.map((l2) => {
    const scores = [];
    const labels = [];
    for (let k = 0; k < 3; k++) {
      const inner = train.filter((r) => fold(r.listing) !== k);
      const held = train.filter((r) => fold(r.listing) === k);
      if (!drops(inner) || !drops(held)) continue;
      const model = trainLogisticRegression(X(inner), y(inner), { ...TRAIN, l2 });
      for (const r of held) { scores.push(predictProba(r.features, model)); labels.push(r.label); }
    }
    return { l2, ap: averagePrecision(scores, labels) ?? 0 };
  });
  const best = [...scored].sort((a, b) => b.ap - a.ap)[0];
  return { model: trainLogisticRegression(X(train), y(train), { ...TRAIN, l2: best.l2 }), l2: best.l2, tried: scored };
}

/** The model and the baselines on `test`, with listing-resampled intervals. */
function evaluate(train, test) {
  const { model, l2, tried } = fitModel(train);
  const baseRate = rate(train);
  const scorers = {
    "Trained model (logistic regression)": (r) => predictProba(r.features, model),
    "No change: never drops (the base rate for everyone)": () => baseRate,
    "Outlook rule: how far above its 30-day median": (r) => r.features[feature("vsMedian")],
    "It just fell: the drop over the last 7 days": (r) => -r.features[feature("change7")],
    "Store-wide: share of the store's prices that fell this week": (r) => r.features[feature("storeFell7")],
  };
  const labels = y(test);
  const groups = test.map((r) => r.listing);
  const scoresOf = Object.fromEntries(Object.entries(scorers).map(([name, f]) => [name, test.map(f)]));
  const results = Object.keys(scorers).map((name) => {
    const scores = scoresOf[name];
    const probability = name.startsWith("Trained") || name.startsWith("No change");
    const constant = name.startsWith("No change");
    const pick = (ix) => [ix.map((i) => scores[i]), ix.map((i) => labels[i])];
    return {
      name,
      auc: auc(scores, labels),
      aucInterval: constant ? null : clusterBootstrap(groups, (ix) => auc(...pick(ix))),
      ap: averagePrecision(scores, labels),
      brierSkill: probability ? brierSkill(scores, labels, baseRate) : null,
      brierSkillInterval: probability && !constant ? clusterBootstrap(groups, (ix) => brierSkill(...pick(ix), baseRate)) : null,
      top: atTop(scores, labels, 0.1),
    };
  });
  const model0 = results[0];
  const strongest = results.slice(2).sort((a, b) => b.auc - a.auc)[0];
  const gain = clusterBootstrap(groups, (ix) => {
    const l = ix.map((i) => labels[i]);
    const a = auc(ix.map((i) => scoresOf[model0.name][i]), l);
    const b = auc(ix.map((i) => scoresOf[strongest.name][i]), l);
    return a === null || b === null ? null : a - b;
  });
  // Shuffled-label check: models trained on the same features with the labels shuffled. A pipeline that leaked the future would score
  // well even then; a clean one scores about 0.5, and the spread shows how high noise alone reaches on a test set this size.
  const shuffledAucs = [];
  for (let s = 1; s <= SHUFFLES; s++) {
    const r = random(s);
    const labelsShuffled = y(train);
    for (let i = labelsShuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [labelsShuffled[i], labelsShuffled[j]] = [labelsShuffled[j], labelsShuffled[i]]; }
    const noise = trainLogisticRegression(X(train), labelsShuffled, { ...TRAIN, l2 });
    shuffledAucs.push(auc(test.map((row) => predictProba(row.features, noise)), labels));
  }
  const atOrAbove = shuffledAucs.filter((a) => a >= model0.auc).length;
  return {
    results, l2, tried, baseRate, strongest, gain: { value: model0.auc - strongest.auc, interval: gain },
    shuffled: { mean: shuffledAucs.reduce((a, b) => a + b, 0) / SHUFFLES, max: Math.max(...shuffledAucs), p: (atOrAbove + 1) / (SHUFFLES + 1) },
    dropListings: new Set(test.filter((r) => r.label === 1).map((r) => r.listing)).size,
  };
}

const describe = (set) => `${set.length} samples, ${new Set(set.map((r) => r.listing)).size} listings, ${drops(set)} drops (${(100 * rate(set)).toFixed(2)}%), ${dayDate(Math.min(...set.map((r) => r.day)))} to ${dayDate(Math.max(...set.map((r) => r.day)))}`;
const num = (v, d = 3) => (v === null || v === undefined ? "n/a" : v.toFixed(d));
const pct = (v) => (v === null || v === undefined ? "n/a" : `${(100 * v).toFixed(1)}%`);
const range = (iv) => (iv ? ` (${num(iv[0])} to ${num(iv[1])})` : "");

function resultSection(evaluation, test) {
  const { results, strongest, gain, shuffled, dropListings } = evaluation;
  return [
    `The ${drops(test)} test drops come from **${dropListings} listings**: a figure resting on so few listings can move a lot as history grows.`,
    "",
    "| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |",
    "|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${num(r.auc)}${range(r.aucInterval)} | ${num(r.ap)} | ${r.brierSkill === null ? "n/a" : `${num(r.brierSkill)}${range(r.brierSkillInterval)}`} | ${pct(r.top.precision)} | ${pct(r.top.recall)} | ${num(r.top.lift, 2)} |`),
    "",
    `Chance level: AUC 0.5, average precision ${num(rate(test))} (the test drop rate), Brier skill 0 (no better than predicting the training`,
    `base rate, ${pct(evaluation.baseRate)}, for everything). L2 chosen by cross-validation: ${evaluation.l2} (${evaluation.tried.map((t) => `${t.l2}: AP ${num(t.ap)}`).join(", ")}).`,
    "",
    `Against the strongest baseline ("${strongest.name}"): AUC ${gain.value >= 0 ? "+" : ""}${num(gain.value)}${range(gain.interval)}. ` +
      (gain.interval && gain.interval[0] > 0
        ? "The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise."
        : "The interval includes zero: the model is not shown to rank drop risk better than that baseline."),
    "",
    `Shuffled-label check: ${SHUFFLES} models trained on the same features with the labels shuffled scored AUC ${num(shuffled.mean)} on average and`,
    `${num(shuffled.max)} at most (noise alone, on a test set this size). The real model's ${num(results[0].auc)} is ${shuffled.p <= 1 / (SHUFFLES + 1) ? "above every one of them" : "not above all of them"} (permutation p = ${num(shuffled.p, 3)}).`,
  ];
}

// ---- strict: by date, with a full label-week gap ----
const lastDay = Math.max(...rows.map((r) => r.day));
const testStart = lastDay - STRICT.testDays + 1;
const strictTrain = rows.filter((r) => r.day + FORECAST.WINDOW_DAYS < testStart);
const strictTest = rows.filter((r) => r.day >= testStart);
const strictPossible = strictTrain.length >= STRICT.minTrain && drops(strictTrain) >= STRICT.minTrainDrops
  && strictTest.length >= STRICT.minTest && drops(strictTest) >= STRICT.minTestDrops;
// When not yet: the first day by which enough training samples exist, plus the gap and the test days, plus the week those last test
// samples need to be seen.
let enoughBy = null;
{
  let n = 0;
  let d = 0;
  for (const day of [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b)) {
    for (const r of rows) if (r.day === day) { n += 1; d += r.label; }
    if (n >= STRICT.minTrain && d >= STRICT.minTrainDrops) { enoughBy = day; break; }
  }
}
const strictReadyOn = enoughBy === null ? null : dayDate(enoughBy + FORECAST.WINDOW_DAYS + STRICT.testDays + FORECAST.WINDOW_DAYS + 1);
const strict = strictPossible ? evaluate(strictTrain, strictTest) : null;

// ---- provisional: other listings, later days ----
const rand = random(PROVISIONAL.seed);
const listings = [...new Set(rows.map((r) => r.listing))];
const testListings = new Set(listings.filter(() => rand() < PROVISIONAL.testShare));
const days = rows.map((r) => r.day).sort((a, b) => a - b);
const cutDay = days[Math.floor(days.length / 2)];
const provisionalTrain = rows.filter((r) => !testListings.has(r.listing) && r.day <= cutDay);
const provisionalTest = rows.filter((r) => testListings.has(r.listing) && r.day > cutDay);
const provisional = evaluate(provisionalTrain, provisionalTest);

// ---- the model kept for use: every sample ----
const final = fitModel(rows);
writeFileSync(join(DIR, "model.artifact.json"), JSON.stringify({
  trainedAt: new Date().toISOString(),
  rules: FORECAST,
  featureNames: FEATURE_NAMES,
  ...final.model,
  l2: final.l2,
  baseRate: rate(rows),
  samples: rows.length,
  sampleDays: [dayDate(days[0]), dayDate(days.at(-1))],
  evaluation: strict ? "strict" : "provisional",
}, null, 2));

const weights = FEATURE_NAMES.map((n, i) => [n, final.model.weights[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
const report = [
  `# Will the price drop within ${FORECAST.WINDOW_DAYS} days? (R2)`,
  "",
  `Generated ${new Date().toISOString()} by \`src/scripts/ml/forecast/02-train-evaluate.js\` from \`dataset.json\` (built ${data.builtAt.slice(0, 10)} by 01-build-dataset.js; samples from ${data.firstSampleDate}).`,
  "",
  `A sample is one recorded day of one listing. It is a drop when a record within the next ${FORECAST.WINDOW_DAYS} days is ${FORECAST.DROP * 100}% or more below that day's price.`,
  `A day whose next week was not seen (no record at least ${FORECAST.MIN_SEEN_DAYS} days on), or with fewer than ${FORECAST.MIN_HISTORY_DAYS} days of records behind it, is not a sample.`,
  `Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: ${describe(rows)}.`,
  "",
  `Drops are rare, so accuracy is not reported: "never drops" would be about ${pct(1 - rate(rows))} accurate and useless. Intervals are 95%,`,
  "from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).",
  "",
  "## Strict evaluation (by date, with a full week between training labels and the test days)",
  "",
  ...(strict
    ? [`- Training: ${describe(strictTrain)}.`, `- Test: ${describe(strictTest)}.`, "", ...resultSection(strict, strictTest)]
    : [
        `Not possible yet. A ${FORECAST.WINDOW_DAYS}-day forecast tested on ${STRICT.testDays} days needs training samples whose label week ended before`,
        `those days, at least ${STRICT.minTrain} of them with ${STRICT.minTrainDrops} drops; today that leaves ${describe(strictTrain.length ? strictTrain : [{ listing: 0, day: lastDay, label: 0 }]).replace(/^1 samples.*/, "none")}.`,
        strictReadyOn ? `With records arriving as they do now, it becomes possible once prices are recorded up to about **${strictReadyOn}**: re-run 01 and 02 then.` : "",
      ]),
  "",
  "## Provisional evaluation (other listings, later days)",
  "",
  `- Training: ${describe(provisionalTrain)} (70% of listings, days up to ${dayDate(cutDay)}).`,
  `- Test: ${describe(provisionalTest)} (the other 30% of listings, days after ${dayDate(cutDay)}).`,
  "- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt",
  "  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.",
  "",
  ...resultSection(provisional, provisionalTest),
  "",
  "## What the model learned (trained on every sample)",
  "",
  `L2 ${final.l2}. Weights on standardized features (positive raises the predicted chance of a drop), largest first:`,
  "",
  "| Feature | Weight |",
  "|---|---|",
  ...weights.map(([n, w]) => `| ${n} | ${w >= 0 ? "+" : ""}${w.toFixed(3)} |`),
  "",
  "## Limits",
  "",
  "- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples",
  "  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.",
  "- Re-run 01 and 02 as history grows; results may change in either direction.",
  "",
];
writeFileSync(join(DIR, "FORECAST_REPORT.md"), report.join("\n"));
console.log(report.join("\n"));
