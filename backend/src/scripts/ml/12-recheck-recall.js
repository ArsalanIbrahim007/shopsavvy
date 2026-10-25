// 12-recheck-recall.js — grouping recall, step 3: after a change to the matcher, regroup the live catalogue and score the SAME
// labelled sample (10, 11) again.
//
// The candidate pairs and their strata were fixed when the sample was drawn (by the grouping of that day), so the labelled sample
// stays a valid stratified sample of the same population; only whether each pair is now together changes. So, with every
// stratum still counting by its size:
//   correct now   = the same-product pairs now together      (scaled, stratum by stratum)
//   missed now    = the same-product pairs now apart
//   wrong now     = the different-product pairs now together
//   recall        = correct / (correct + missed),   pair precision = correct / (correct + wrong)
// Offers are found by their address; a pair with an offer no longer listed is left out of its stratum's sample.
//
//   node src/scripts/ml/12-recheck-recall.js            prints both, and writes src/ml/dataset/group_recall.recheck.json
//   (11-score-recall.js then adds the recheck to GROUPING_RECALL.md)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { closeGroupingPool, groupListings } from "../../services/grouping.service.js";

const ML = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml");
const read = (name) => JSON.parse(readFileSync(join(ML, "dataset", name), "utf8"));
const urlOf = (offer) => offer.productUrl || offer.sourceUrl || offer.url || null;

const sample = read("group_recall.sample.json");
const labels = read("group_recall.labels.json");

await mongoose.connect(process.env.MONGO_URI);
const groupOfUrl = new Map();
for (const category of Object.keys(sample.population)) {
  const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category }).lean();
  const groups = await groupListings(listings, { strategy: "ml", recommend: false, priority: "background", timeoutMs: 20 * 60 * 1000 });
  groups.forEach((group, index) => { for (const offer of group.offers ?? []) groupOfUrl.set(urlOf(offer), `${category}:${index}`); });
  console.log(`${category.padEnd(11)} regrouped: ${listings.length} listings, ${groups.length} groups`);
}

const pairs = sample.pairs.map((p) => {
  const ga = groupOfUrl.get(p.a.url);
  const gb = groupOfUrl.get(p.b.url);
  return { id: p.id, stratum: p.stratum, verdict: labels[p.id], gone: !ga || !gb, togetherNow: Boolean(ga && gb && ga === gb) };
});

// Each count is scaled stratum by stratum: (stratum's candidate pairs) x (share of its judged sample that matches `pick`).
const names = Object.keys(sample.strata);
const judged = (name) => pairs.filter((p) => p.stratum === name && !p.gone && p.verdict);
const stratumCounts = (pick) => names.map((name) => ({ name, population: sample.strata[name], judged: judged(name).length, same: judged(name).filter(pick).length }));
const scaled = (pick) => stratumCounts(pick).reduce((sum, s) => sum + (s.judged ? (s.population * s.same) / s.judged : 0), 0);

const correct = scaled((p) => p.verdict === "same" && p.togetherNow);
const missed = scaled((p) => p.verdict === "same" && !p.togetherNow);
const wrong = scaled((p) => p.verdict === "different" && p.togetherNow);
// Point estimates only, with the pairs behind them listed; the 95% interval is computed for the first measurement (11), not here.
const moved = pairs.filter((p) => p.verdict === "same" && p.stratum !== "together" && p.togetherNow).map((p) => p.id);
const split = pairs.filter((p) => p.verdict === "same" && p.stratum === "together" && !p.togetherNow).map((p) => p.id);
const newlyWrong = pairs.filter((p) => p.verdict === "different" && p.stratum !== "together" && p.togetherNow).map((p) => p.id);
const fixedWrong = pairs.filter((p) => p.verdict === "different" && p.stratum === "together" && !p.togetherNow).map((p) => p.id);

const record = {
  at: new Date().toISOString(),
  recall: correct + missed > 0 ? correct / (correct + missed) : null,
  precision: correct + wrong > 0 ? correct / (correct + wrong) : null,
  correct, missed, wrong,
  sameNowTogether: moved, sameNowSplit: split, differentNowTogether: newlyWrong, differentNowApart: fixedWrong,
  gone: pairs.filter((p) => p.gone).map((p) => p.id),
};
writeFileSync(join(ML, "dataset", "group_recall.recheck.json"), JSON.stringify(record, null, 2));

const pct = (x) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
console.log(`\nrecall now ${pct(record.recall)}, pair precision now ${pct(record.precision)}`);
console.log(`same-product pairs: now together ${moved.length} that were apart (${moved.join(", ")}); now split ${split.length} that were together (${split.join(", ")})`);
console.log(`different-product pairs: now together ${newlyWrong.length} (${newlyWrong.join(", ")}); now apart ${fixedWrong.length} that were together (${fixedWrong.join(", ")})`);
console.log(`offers no longer listed: ${record.gone.length}`);
await closeGroupingPool();
await mongoose.disconnect();
process.exit(0);
