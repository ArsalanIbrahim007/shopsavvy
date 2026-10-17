// 08-score-group-merges.js — B9, grouping-level evaluation, step 2: turn a person's judgements of the sampled merges
// (07-sample-group-merges.js) into merge precision, and write src/ml/GROUPING_EVALUATION.md.
//
// Merge precision = merges judged "same product" / merges judged either way. "Unsure" is reported, not counted. Each figure comes
// with a 95% Wilson interval (sound for small samples and for proportions near 1). The overall figure is given twice: as sampled,
// and weighted by how many merges each category really has (the sample gives small categories a floor of 8, so the raw figure
// leans towards them).
//
//   node src/scripts/ml/08-score-group-merges.js
// Reads src/ml/dataset/group_merges.sample.json and src/ml/dataset/group_merges.labels.json ({ "m001": "same", ... }).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ML = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml");

/** 95% Wilson score interval for k successes in n trials, as [low, high] proportions; null for n = 0. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return null;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

/** Counts and precision for a list of { verdict }. */
export function tally(items) {
  const same = items.filter((i) => i.verdict === "same").length;
  const different = items.filter((i) => i.verdict === "different").length;
  const unsure = items.filter((i) => i.verdict === "unsure").length;
  const judged = same + different;
  return { same, different, unsure, unlabelled: items.filter((i) => !i.verdict).length, judged, precision: judged ? same / judged : null, interval: wilson(same, judged) };
}

/** Precision weighted by each category's share of all merges (categories with nothing judged are left out of the weights). */
export function weightedPrecision(byCategory, population) {
  let weight = 0;
  let sum = 0;
  for (const [category, t] of Object.entries(byCategory)) {
    if (t.precision === null) continue;
    weight += population[category] ?? 0;
    sum += (population[category] ?? 0) * t.precision;
  }
  return weight ? sum / weight : null;
}

const pct = (p) => (p === null || p === undefined ? "–" : `${(p * 100).toFixed(1)}%`);
const range = (iv) => (iv ? `${pct(iv[0])} to ${pct(iv[1])}` : "–");

const isMain = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const sample = JSON.parse(readFileSync(join(ML, "dataset", "group_merges.sample.json"), "utf8"));
  const labels = JSON.parse(readFileSync(join(ML, "dataset", "group_merges.labels.json"), "utf8"));
  const about = labels._about ?? "";
  let reasons = {};
  try {
    reasons = JSON.parse(readFileSync(join(ML, "dataset", "group_merges.reasons.json"), "utf8"));
  } catch {
    /* reasons are optional */
  }
  const items = sample.merges.map((m) => ({ ...m, verdict: labels[m.id] ?? null }));

  const overall = tally(items);
  const categories = [...new Set(items.map((i) => i.category))];
  const byCategory = Object.fromEntries(categories.map((c) => [c, tally(items.filter((i) => i.category === c))]));
  const weighted = weightedPrecision(byCategory, sample.population);
  const wrong = items.filter((i) => i.verdict === "different");

  // The blind human spot-check (group_merges.spotcheck.json: { "m010": "same", ... }), made without seeing the labels above.
  let spot = null;
  try {
    spot = JSON.parse(readFileSync(join(ML, "dataset", "group_merges.spotcheck.json"), "utf8"));
  } catch {
    /* not done yet */
  }
  const spotIds = spot ? Object.keys(spot).filter((id) => labels[id]) : [];
  const agreed = spotIds.filter((id) => spot[id] === labels[id]);
  const spotLine = spotIds.length
    ? `Blind human spot-check (Arsalan, ${spotIds.length} merges drawn at random): agreed with these labels on **${agreed.length} of ${spotIds.length}** (${pct(agreed.length / spotIds.length)}; 95% interval ${range(wilson(agreed.length, spotIds.length))}).` +
      (agreed.length < spotIds.length ? ` Disagreements: ${spotIds.filter((id) => spot[id] !== labels[id]).map((id) => `${id} (labelled ${labels[id]}, spot-check ${spot[id]})`).join("; ")}.` : "")
    : "Blind human spot-check: pending.";

  // The same labelled merges after a change to the matcher (09-recheck-group-merges.js --record), if that has been run.
  let recheck = null;
  try {
    recheck = JSON.parse(readFileSync(join(ML, "dataset", "group_merges.recheck.json"), "utf8"));
  } catch {
    /* not rechecked */
  }
  const after = [];
  if (recheck) {
    const stateOf = new Map(recheck.states.map((s) => [s.id, s.state]));
    const count = (verdict, state) => items.filter((i) => i.verdict === verdict && stateOf.get(i.id) === state).length;
    const still = tally(items.filter((i) => stateOf.get(i.id) === "kept"));
    const stillWrong = items.filter((i) => i.verdict === "different" && stateOf.get(i.id) === "kept");
    after.push(
      `## After the matcher fixes (${recheck.at.slice(0, 10)})`,
      "",
      "The live catalogue regrouped with the fixes (`src/scripts/ml/09-recheck-group-merges.js`), and each labelled merge checked again:",
      "",
      `- wrong merges now split: **${count("different", "split")} of ${overall.different}**`,
      `- correct merges kept: **${count("same", "kept")} of ${overall.same}** (lost: ${count("same", "split")})`,
      `- unsure merges split: ${count("unsure", "split")} of ${overall.unsure}; offers no longer listed: ${recheck.states.filter((s) => s.state === "gone").length}`,
      `- precision over the sampled merges still made: **${pct(still.precision)}** (${still.same} of ${still.judged}; 95% interval ${range(still.interval)})`,
      "",
      stillWrong.length ? `Still wrong: ${stillWrong.map((w) => `${w.id} (${(reasons[w.id] ?? "").replace(/\.$/, "")})`).join("; ")}.` : "No sampled wrong merge remains.",
      ...items.filter((i) => i.verdict === "same" && stateOf.get(i.id) === "split").map((i) =>
        `Lost: ${i.id}, ${i.main.platform} "${i.main.title}" and ${i.offer.platform} "${i.offer.title}" (neither states a capacity, and such titles are now placed by price, which put these two apart).`),
      "",
      "Read this with care: the sample was drawn from the grouping before the fixes, so it shows that known mistakes are gone and correct",
      "merges kept; it cannot score merges the fixes newly make." +
        (recheck.changedGroups != null
          ? ` Those are listed by the same script against a snapshot of the old grouping: ${recheck.groupsBefore} groups became ${recheck.groupsNow},` +
            ` ${recheck.newlyTogether} pairs of offers are newly together and ${recheck.newlyApart} newly apart, in ${recheck.changedGroups} changed groups,` +
            " every one of which Claude read, before and after, before the fixes were kept; the new mistakes found that way (Galaxy S7 / S7 edge," +
            " Redmi 10 / 10 Prime, Redmi Note 11T Pro / Note 15 Pro, a 4G tablet beside a Wi-Fi one) became rules and tests as well." +
            " An unbiased figure for the new grouping needs a fresh sample (07 with another seed)."
          : ""),
      "",
    );
  }

  const rows = categories.map((c) => {
    const t = byCategory[c];
    return `| ${c} | ${sample.population[c]} | ${t.same + t.different + t.unsure} | ${t.same} | ${t.different} | ${t.unsure} | ${pct(t.precision)} | ${range(t.interval)} |`;
  });
  const md = [
    "# Grouping evaluation (B9): how often the live site puts an offer under the right product",
    "",
    `Sample drawn ${sample.drawnAt.slice(0, 10)} with seed ${sample.seed} (\`src/scripts/ml/07-sample-group-merges.js\`): ${sample.sampleSize} merges, chosen at random from`,
    `${Object.values(sample.population).reduce((a, b) => a + b, 0)} made by the production grouping (trained matcher, \`${sample.strategy}\`) over every visible active listing of the six deal categories.`,
    "A merge is an offer the site placed under a product, judged against that product's main offer using the rubric: same model, same",
    "storage and RAM variant, same condition; colour may differ. Scored by `src/scripts/ml/08-score-group-merges.js`.",
    "",
    about ? `Who labelled, and how: ${about}` : "",
    "",
    `**Merge precision: ${pct(overall.precision)}** (${overall.same} of ${overall.judged} judged merges correct; 95% interval ${range(overall.interval)}).`,
    `Weighted by each category's real share of merges: **${pct(weighted)}**.`,
    `Unsure: ${overall.unsure}. Not yet labelled: ${overall.unlabelled}.`,
    spotLine,
    "",
    "| Category | Merges in catalogue | Sampled | Same | Different | Unsure | Precision | 95% interval |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## The wrong merges",
    "",
    wrong.length === 0
      ? "None."
      : "| Id | Category | Main offer | Merged offer | Why it is wrong |\n|---|---|---|---|---|\n" +
        wrong.map((w) => `| ${w.id} | ${w.category} | ${w.main.platform}: ${w.main.title.replace(/\|/g, "/")} | ${w.offer.platform}: ${w.offer.title.replace(/\|/g, "/")} | ${(reasons[w.id] ?? "").replace(/\|/g, "/")} |`).join("\n"),
    "",
    ...after,
    "What this does and does not measure: precision only (a wrong merge shows a shopper a different product's price as this one's, the costlier",
    "error). It does not measure recall (two offers of one product left in separate groups), which needs a different sample: pairs the site",
    "did not merge. Pair-level scores for the trained matcher are in EVALUATION_REPORT.md.",
    "",
  ].join("\n");
  writeFileSync(join(ML, "GROUPING_EVALUATION.md"), md);
  console.log(md);
}
