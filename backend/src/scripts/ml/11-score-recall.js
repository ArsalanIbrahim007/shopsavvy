// 11-score-recall.js — grouping recall, step 2: from the labelled sample (10-sample-recall-pairs.js), how many pairs of offers of
// the same product does the live site keep apart, and what share of all same-product pairs does it bring together?
//
// Each stratum's share of same-product pairs is scaled by the stratum's real size (the sample over-represents the most similar
// apart pairs on purpose), so:
//   correct merges = together pairs x p(together)
//   missed merges  = sum over apart strata of (pairs x p(stratum))
//   recall         = correct / (correct + missed)
// The 95% interval comes from simulating every stratum's share from its Jeffreys posterior, Beta(same + 1/2, different + 1/2),
// 20,000 times with a fixed seed, and taking the 2.5th and 97.5th percentiles of the recall that results.
//
//   node src/scripts/ml/11-score-recall.js     reads src/ml/dataset/group_recall.{sample,labels,reasons}.json, writes src/ml/GROUPING_RECALL.md

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { attributeConflict } from "../../services/similarity.service.js";
import { classifyPairML } from "../../services/similarityModel.service.js";

/** Why the current matcher keeps a pair apart: a hard rule, the trained model's score, or neither (the grouping as a whole). */
function whyApart(p) {
  if (attributeConflict(p.a.title, p.b.title, { ignoreUnstatedStorage: true })) return "a hard rule (veto)";
  const ml = classifyPairML({ title: p.a.title, price: p.a.price }, { title: p.b.title, price: p.b.price });
  if (!ml.isMatch) return `the trained model (score ${ml.probability.toFixed(2)})`;
  return `neither: the model scores ${ml.probability.toFixed(2)}, the grouping kept them apart`;
}

const ML = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml");
const read = (name) => JSON.parse(readFileSync(join(ML, "dataset", name), "utf8"));
const DRAWS = 20000;

/** mulberry32, seeded, so the interval is the same every run. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller). */
const normal = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/** A Gamma(shape, 1) draw: Marsaglia and Tsang, with the usual boost for shape < 1. */
function gamma(shape, rand) {
  if (shape < 1) return gamma(shape + 1, rand) * Math.pow(rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

const beta = (a, b, rand) => {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
};

/**
 * Recall and its interval from per-stratum counts.
 * @param {Array<{name: string, population: number, same: number, judged: number}>} strata  the "together" stratum and the apart ones
 */
export function estimateRecall(strata, { draws = DRAWS, seed = 20261026 } = {}) {
  const together = strata.find((s) => s.name === "together");
  const apart = strata.filter((s) => s.name !== "together");
  const share = (s) => (s.judged ? s.same / s.judged : 0);
  const correct = together.population * share(together);
  const missed = apart.reduce((sum, s) => sum + s.population * share(s), 0);
  const point = correct + missed > 0 ? correct / (correct + missed) : null;

  const rand = random(seed);
  const simulated = [];
  for (let i = 0; i < draws; i++) {
    const c = together.population * beta(together.same + 0.5, together.judged - together.same + 0.5, rand);
    const m = apart.reduce((sum, s) => sum + s.population * beta(s.same + 0.5, s.judged - s.same + 0.5, rand), 0);
    simulated.push(c / (c + m));
  }
  simulated.sort((a, b) => a - b);
  const at = (q) => simulated[Math.min(simulated.length - 1, Math.floor(q * simulated.length))];
  return { correct, missed, recall: point, interval: [at(0.025), at(0.975)] };
}

const pct = (x) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`);
const whole = (x) => Math.round(x).toLocaleString("en-US");

/** The section for 12-recheck-recall.js's result (the same labelled pairs after a change to the matcher), when it has run. */
function recheckSection() {
  let recheck;
  try {
    recheck = read("group_recall.recheck.json");
  } catch {
    return [];
  }
  const ids = (list) => (list.length ? list.join(", ") : "none");
  return [
    `## After the fixes (${new Date(recheck.at).toLocaleDateString("en-CA")})`,
    "",
    "The live catalogue regrouped with the matcher fixed (`12-recheck-recall.js`): a title stating only its RAM no longer reads as storage,",
    "and a television's model code matches with or without its screen size in front. The same labelled pairs, scored again:",
    "",
    `- **recall: ${pct(recheck.recall)}** (was the figure above); estimated ${whole(recheck.correct)} same-product pairs together, ${whole(recheck.missed)} apart`,
    `- **pair precision: ${pct(recheck.precision)}**; estimated ${whole(recheck.wrong)} different-product pairs together`,
    `- same-product pairs now together that were apart: ${ids(recheck.sameNowTogether)}; now apart that were together: ${ids(recheck.sameNowSplit)}`,
    `- different-product pairs now together: ${ids(recheck.differentNowTogether)}; now apart that were together: ${ids(recheck.differentNowApart)}`,
    "",
    "The merge-precision sample (GROUPING_EVALUATION.md, 09 against a snapshot of the old grouping) was rechecked the same day: no",
    "correct merge was newly split (the two split ones, m034 and m047, were split before), precision over the merges still made was",
    "97.1%, and of the 3,103 pairs of offers newly together a random 40 and the 40 furthest apart in price were",
    "read; all were the same product (store price differences such as instalment prices, not different models). The trained matcher's",
    "pair scores (EVALUATION_REPORT.md) rose: accuracy 79.0% to 80.0%, precision 76.9% to 78.6%, recall 34.5% to 37.9%.",
    "",
  ];
}

function main() {
  const sample = read("group_recall.sample.json");
  const labels = read("group_recall.labels.json");
  const reasons = read("group_recall.reasons.json");
  const pairs = sample.pairs.map((p) => ({ ...p, verdict: labels[p.id] ?? null }));
  const unlabelled = pairs.filter((p) => !p.verdict).length;

  const names = Object.keys(sample.strata);
  const strata = names.map((name) => {
    const inStratum = pairs.filter((p) => p.stratum === name && p.verdict);
    return { name, population: sample.strata[name], same: inStratum.filter((p) => p.verdict === "same").length, judged: inStratum.length };
  });
  const result = estimateRecall(strata);
  const together = strata.find((s) => s.name === "together");
  const missedPairs = pairs.filter((p) => p.stratum !== "together" && p.verdict === "same");
  const wrongTogether = pairs.filter((p) => p.stratum === "together" && p.verdict === "different");
  const judgement = pairs.filter((p) => (reasons[p.id] ?? "").startsWith("Judgement"));
  const label = { together: "together (one product on the site)", apart_high: "apart, similarity 0.8 or more", apart_mid: "apart, similarity 0.6 to 0.8", apart_low: "apart, similarity 0.4 to 0.6" };
  const line = (p) => `| ${p.id} | ${p.category} | ${p.stratum} | ${p.a.platform} "${p.a.title}" (PKR ${p.a.price.toLocaleString("en-US")}) | ${p.b.platform} "${p.b.title}" (PKR ${p.b.price.toLocaleString("en-US")}) | ${(reasons[p.id] ?? "").replace(/\|/g, "/")} |`;

  const md = [
    "# Grouping recall: how often the site leaves one product split in two",
    "",
    `Sample drawn ${new Date(sample.drawnAt).toLocaleDateString("en-CA")} with seed ${sample.seed} (\`src/scripts/ml/10-sample-recall-pairs.js\`), scored by \`11-score-recall.js\`.`,
    `Grouping: the production one (trained matcher, \`${sample.strategy}\`) over every visible active listing of ${Object.keys(sample.population).join(", ")}.`,
    "",
    `**Recall: ${pct(result.recall)}** (95% interval ${pct(result.interval[0])} to ${pct(result.interval[1])}): of all pairs of offers of the same product`,
    `from two stores (among the candidate pairs below), the share the site shows as one product. Estimated ${whole(result.correct)} such pairs together`,
    `and ${whole(result.missed)} kept apart.`,
    "",
    `Pair precision, from the same sample: ${together.same} of ${together.judged} pairs the site put together are the same product (${pct(together.judged ? together.same / together.judged : null)}).`,
    `Unlabelled: ${unlabelled}.`,
    "",
    "## How it was measured",
    "",
    `- **Candidate pairs:** two offers from different stores in the same category whose titles share at least ${sample.minSimilarity * 100}% of their model words`,
    "  (Jaccard over the normalised title without capacities and tier words, as the matcher's rule compares). All other pairs are left out: they are",
    "  almost never the same product, but any that are would lower recall, so this is recall among candidate pairs.",
    "- **Strata:** what the site did with each candidate pair, and for the pairs it kept apart, how similar their titles are. The most similar apart",
    "  pairs, where missed merges concentrate, were sampled hardest; each stratum counts by its real size, so that does not bias the estimate.",
    "- **Labels:** every sampled pair judged same or different from the titles and prices alone, with `src/ml/dataset/LABELING_RUBRIC.md` and the",
    "  site's rule that PTA-approved and non-PTA phones are different products; read blind (without the stratum). By Claude; a person's blind",
    "  spot-check is still to do.",
    "",
    "| Stratum | Candidate pairs | Sampled | Same | Different | Same share |",
    "|---|---|---|---|---|---|",
    ...strata.map((s) => `| ${label[s.name] ?? s.name} | ${whole(s.population)} | ${s.judged} | ${s.same} | ${s.judged - s.same} | ${pct(s.judged ? s.same / s.judged : null)} |`),
    "",
    "## The same product kept apart (missed merges in the sample)",
    "",
    "The last column is what the current matcher does with the pair (a veto in `attributeConflict`, or the trained model's score).",
    "",
    "| Id | Category | Stratum | Offer A | Offer B | Why they are the same | Kept apart by |",
    "|---|---|---|---|---|---|---|",
    ...missedPairs.map((p) => `${line(p)} ${whyApart(p)} |`),
    "",
    `Kept apart by a veto: ${missedPairs.filter((p) => whyApart(p).startsWith("a hard")).length} of ${missedPairs.length}; by the trained model's score: ` +
      `${missedPairs.filter((p) => whyApart(p).startsWith("the trained")).length}; by neither: ${missedPairs.filter((p) => whyApart(p).startsWith("neither")).length}.`,
    "",
    wrongTogether.length ? "## Pairs the site put together that are different" : "",
    wrongTogether.length ? "" : "",
    ...(wrongTogether.length ? ["| Id | Category | Stratum | Offer A | Offer B | Why they differ |", "|---|---|---|---|---|---|", ...wrongTogether.map(line), ""] : []),
    "## Judgement calls",
    "",
    "Labels where the rubric needed judgement; a person's spot-check should look at these first.",
    "",
    "| Id | Category | Stratum | Offer A | Offer B | Label and reason |",
    "|---|---|---|---|---|---|",
    ...judgement.map((p) => line({ ...p, id: `${p.id} (${p.verdict})` })),
    "",
    ...recheckSection(),
    "## What this does and does not measure",
    "",
    "Pair recall among candidate pairs: one product split into two groups of five offers each counts as 25 missed pairs, as is usual for this",
    "measure. Together with merge precision (GROUPING_EVALUATION.md) it describes both mistakes a comparison can make: showing two products as",
    "one (precision) and one product as two (recall). The first is the costlier, since it shows a shopper another product's price, and the",
    "matcher is tuned to avoid it, which is why recall is the lower of the two.",
    "",
  ].join("\n");

  writeFileSync(join(ML, "GROUPING_RECALL.md"), md);
  console.log(`recall ${pct(result.recall)} (95% ${pct(result.interval[0])} to ${pct(result.interval[1])}); correct ${whole(result.correct)}, missed ${whole(result.missed)}`);
  for (const s of strata) console.log(`  ${s.name.padEnd(11)} ${String(s.population).padStart(7)} pairs, sampled ${s.judged}, same ${s.same}`);
  console.log("written src/ml/GROUPING_RECALL.md");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
