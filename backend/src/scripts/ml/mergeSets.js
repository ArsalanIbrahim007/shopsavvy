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
    // What the report says after a recheck (08): why a correct merge was lost, and how the pairs the fixes moved were read.
    recheck: {
      lostReason: () => "neither states a capacity, and such titles are now placed by price, which put these two apart",
      review: "every one of which Claude read, before and after, before the fixes were kept; the new mistakes found that way (Galaxy S7 /" +
        " S7 edge, Redmi 10 / 10 Prime, Redmi Note 11T Pro / Note 15 Pro, a 4G tablet beside a Wi-Fi one) became rules and tests as well.",
    },
  },
  appliances: {
    categories: ["air_conditioner", "refrigerator", "washing_machine", "monitor"],
    size: 60,
    minPerCategory: 12,
    seed: 20261022,
    file: "group_merges_appliances",
    report: "GROUPING_EVALUATION_APPLIANCES.md",
    title: "Grouping evaluation, appliances and monitors: how often an offer is put under the right product",
    recheck: {
      lostReason: (id) => ({
        m001: "the Shophive title names the Breeze In series beside the T-Pro's code 12T3-PRO, and the series rule believes it",
        m003: "the Shophive title names the Breeze In series beside the T-Pro's code 12T3-PRO, and the series rule believes it",
      })[id] ?? "no rule separates the two; the offer went to another group of the same model when the groups re-formed",
      review: "of which Claude read every pair whose titles disagree on a model number, code or series, and a sample of the rest; the new" +
        " mistakes found that way (DigiMall's seller codes ISPK-0577 / ISPK-0621 read as model codes, the colour W of DW-6550W read as" +
        " watts, \"DW-10095 GB\" read as gigabytes, \"Haier-10 kg\" read as a code, HDF-465 / HDF-465INV split, Dawlance 9178 Avante+" +
        " and Chrome refrigerators newly together) became rules and tests as well. Phones, laptops and the other core categories were" +
        " rechecked the same way: their sampled precision is unchanged (95.8%), and the 21 pairs that moved are all corrections" +
        " (two A4Tech headsets, HS-30i and HU-50, and four Dawlance washing machines filed there).",
    },
  },
});

/** The set named by --set= in `argv` (core when none). */
export function mergeSet(argv = process.argv) {
  const name = argv.find((a) => a.startsWith("--set="))?.slice("--set=".length) ?? "core";
  if (!MERGE_SETS[name]) throw new Error(`Unknown --set=${name}; known: ${Object.keys(MERGE_SETS).join(", ")}`);
  return { name, ...MERGE_SETS[name] };
}
