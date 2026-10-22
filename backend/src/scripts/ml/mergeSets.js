// mergeSets.js — the samples the grouping evaluation (07, 08, 09) can be run on, each with its own files, so a new category set can be
// measured without disturbing an evaluation already reported.
//
//   core        the six categories evaluated in B9 (2026-10-17): files group_merges.*, report GROUPING_EVALUATION.md
//   appliances  the four added on 2026-10-22: files group_merges_appliances.*, report GROUPING_EVALUATION_APPLIANCES.md
//
// Choose one with --set=<name> (default core).

export const MERGE_SETS = Object.freeze({
  core: {
    categories: ["smartphone", "laptop", "tv", "tablet", "smartwatch", "headphones"],
    size: 100,
    minPerCategory: 8,
    seed: 20261015,
    file: "group_merges",
    report: "GROUPING_EVALUATION.md",
    title: "Grouping evaluation (B9): how often the live site puts an offer under the right product",
  },
  appliances: {
    categories: ["air_conditioner", "refrigerator", "washing_machine", "monitor"],
    size: 60,
    minPerCategory: 12,
    seed: 20261022,
    file: "group_merges_appliances",
    report: "GROUPING_EVALUATION_APPLIANCES.md",
    title: "Grouping evaluation, appliances and monitors: how often an offer is put under the right product",
  },
});

/** The set named by --set= in `argv` (core when none). */
export function mergeSet(argv = process.argv) {
  const name = argv.find((a) => a.startsWith("--set="))?.slice("--set=".length) ?? "core";
  if (!MERGE_SETS[name]) throw new Error(`Unknown --set=${name}; known: ${Object.keys(MERGE_SETS).join(", ")}`);
  return { name, ...MERGE_SETS[name] };
}
