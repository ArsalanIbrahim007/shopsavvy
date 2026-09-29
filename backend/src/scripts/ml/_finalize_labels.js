// _finalize_labels.js — applies the reviewed corrections on top of
// pairs.suggested.json and writes the final pairs.labeled.json. One-off
// authoring script, not part of the numbered pipeline.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(__dirname, "..", "..", "ml", "dataset");

const suggested = JSON.parse(readFileSync(join(DATASET_DIR, "pairs.suggested.json"), "utf8"));

// Manual corrections found during review of the 19 flagged pairs (see
// EVALUATION_REPORT.md for the full review log). Keyed by idA+idB.
const CORRECTIONS = {
  // R530 is the Galaxy Buds3's own model code (not a different tier, unlike
  // "Buds Pro" vs "Buds 2 Pro" which genuinely are different generations) --
  // same product, one listing just omits the code.
  "6a7a374bdc7ea9aa971cccc7|6a7b7bec9de462208cfb96a6": {
    label: 1,
    rationale: "R530 is Galaxy Buds3's own model code (not a different generation); same product, listing A omits the code",
  },
};

const labeled = suggested.map((row) => {
  const key = `${row.idA}|${row.idB}`;
  const correction = CORRECTIONS[key];
  const label = correction ? correction.label : row.suggestedLabel;
  const rationale = correction ? correction.rationale : row.rationale;

  return {
    idA: row.idA, idB: row.idB,
    titleA: row.titleA, titleB: row.titleB,
    platformA: row.platformA, platformB: row.platformB,
    priceA: row.priceA, priceB: row.priceB,
    categoryA: row.categoryA, categoryB: row.categoryB,
    pool: row.pool,
    jaccardBase: row.jaccardBase,
    label,
    rationale,
    reviewed: Boolean(row.needsReview),
    corrected: Boolean(correction),
  };
});

writeFileSync(join(DATASET_DIR, "pairs.labeled.json"), JSON.stringify(labeled, null, 2));

const counts = labeled.reduce((acc, r) => { acc[r.label] = (acc[r.label] || 0) + 1; return acc; }, {});
console.log(`Finalized ${labeled.length} labeled pairs.`);
console.log(`Label counts:`, counts);
console.log(`Corrections applied: ${labeled.filter((r) => r.corrected).length}`);
console.log(`Reviewed (flagged) pairs: ${labeled.filter((r) => r.reviewed).length}`);
