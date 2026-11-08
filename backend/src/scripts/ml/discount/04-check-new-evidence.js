// 04-check-new-evidence.js — are the discount verdicts reached WITHOUT a listing's own history right?
//
// Since 2026-11-08 a claim whose listing has too little history of its own is judged on other evidence (ranking/dealScore.js
// judgeWithMoreEvidence): the same product's history at the other stores, then the fair price for its specs. That cut the
// "unverified" claims from 54.7% to 6.2%, but more verdicts are only worth having if they are right.
//
// The check: take the claims the listing's OWN history can judge (the direct evidence: did this store sell at its "was" price?),
// hide that history, judge the claim the way a listing without history is judged, and compare the two verdicts. The other stores'
// histories exclude this listing's own, so nothing of the answer leaks in. (The fair-price model was trained on current prices,
// which include this listing's current price, but never on any "was" price.)
//
// A verdict is on the genuine side (genuine, likely genuine) or the inflated side (suspicious, likely fake). Reported for each kind
// of evidence: how often it judged (did not stay unverified), and of those, how often it took the same side as the listing's own
// history.
//
//   node src/scripts/ml/discount/04-check-new-evidence.js            prints the tables
//   node src/scripts/ml/discount/04-check-new-evidence.js --record   also writes src/ml/discount/NEW_EVIDENCE_CHECK.md

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../../config/platforms.js";
import Listing from "../../../models/listing.model.js";
import { attachPriceHistory } from "../../../services/historyEnrichment.service.js";
import { groupListingsByProduct } from "../../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../../services/similarityModel.service.js";
import { CATALOG_CATEGORIES } from "../../../services/catalogFeed.service.js";
import { fairPriceOf } from "../../../services/fairPrice.service.js";
import { calculateFakeDiscountScore } from "../../../ranking/scores/fakeDiscountScore.js";
import { judgeWithMoreEvidence } from "../../../ranking/dealScore.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "ml", "discount", "NEW_EVIDENCE_CHECK.md");
const SIDE = { genuine_discount: "genuine", possibly_genuine: "genuine", suspicious: "inflated", likely_fake: "inflated" };

const blank = () => ({ cases: 0, judged: 0, agree: 0, confusion: { "genuine>genuine": 0, "genuine>inflated": 0, "inflated>genuine": 0, "inflated>inflated": 0 } });
const results = { product_history: blank(), fair_price: blank(), either: blank() };
const truthSides = { genuine: 0, inflated: 0 };
const examples = [];

function tally(bucket, truth, side) {
  bucket.cases += 1;
  if (!side) return;
  bucket.judged += 1;
  if (side === truth) bucket.agree += 1;
  bucket.confusion[`${truth}>${side}`] += 1;
}

await mongoose.connect(process.env.MONGO_URI);
try {
  for (const category of CATALOG_CATEGORIES) {
    const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, productCategory: category, price: { $gt: 0 } }).lean();
    const enriched = await attachPriceHistory(listings);
    const groups = groupListingsByProduct(enriched, { matchStrategy: mlMatchStrategy });
    let n = 0;
    for (const group of groups) {
      for (const offer of group.offers) {
        if (!(offer.originalPrice > offer.price)) continue;
        const own = calculateFakeDiscountScore({ currentPrice: offer.price, originalPrice: offer.originalPrice, priceHistory: offer.priceHistory ?? [] });
        const truth = SIDE[own.classification];
        if (!truth) continue; // the listing's own history cannot judge it either: no answer to compare with
        n += 1;
        truthSides[truth] += 1;

        const others = group.offers.filter((o) => o !== offer).flatMap((o) => o.priceHistory ?? []);
        const hidden = { classification: "unverified_discount" };
        const pooledOnly = judgeWithMoreEvidence(hidden, offer, { pooledHistory: others });
        const fairOnly = judgeWithMoreEvidence(hidden, offer, { fairPrice: fairPriceOf(offer) });
        const both = judgeWithMoreEvidence(hidden, offer, { pooledHistory: others, fairPrice: fairPriceOf(offer) });

        tally(results.product_history, truth, SIDE[pooledOnly.classification]);
        tally(results.fair_price, truth, SIDE[fairOnly.classification]);
        tally(results.either, truth, SIDE[both.classification]);
        if (SIDE[both.classification] && SIDE[both.classification] !== truth && examples.length < 12) {
          examples.push({ category, platform: offer.platform, title: offer.title, price: offer.price, was: offer.originalPrice, truth: own.classification, said: both.classification, basis: both.basis });
        }
      }
    }
    console.log(`${category.padEnd(16)} ${String(listings.length).padStart(6)} listings, ${String(n).padStart(5)} claims its own history can judge`);
  }
} finally {
  await mongoose.disconnect();
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const rows = [
  ["Other stores' history of the product", results.product_history],
  ["Fair price for the specs", results.fair_price],
  ["Both, in that order (as the site does)", results.either],
];
// Per side: of the claims it called inflated, how many its own history calls inflated too (and the same for genuine).
const sideCell = (r, side) => {
  const other = side === "inflated" ? "genuine" : "inflated";
  const said = r.confusion[`${side}>${side}`] + r.confusion[`${other}>${side}`];
  return said ? `${said}, ${pct(r.confusion[`${side}>${side}`], said)} right` : "0";
};
const table = [
  "| Evidence, the listing's own history hidden | Claims | Judged | Same side as its own history | Called inflated | Called genuine |",
  "|---|---:|---:|---:|---:|---:|",
  ...rows.map(([name, r]) => `| ${name} | ${r.cases} | ${r.judged} (${pct(r.judged, r.cases)}) | ${r.agree} (${pct(r.agree, r.judged)}) | ${sideCell(r, "inflated")} | ${sideCell(r, "genuine")} |`),
].join("\n");

const total = truthSides.genuine + truthSides.inflated;
const baseline = Math.max(truthSides.genuine, truthSides.inflated);
const summary = `Claims the listing's own history judged: ${total} (${truthSides.genuine} genuine side, ${truthSides.inflated} inflated side). ` +
  `Always answering the commoner side would agree ${pct(baseline, total)} of the time.`;
console.log(`\n${summary}\n\n${table}`);
if (examples.length) {
  console.log("\nDisagreements (first 12):");
  for (const e of examples) console.log(`  ${e.platform} ${e.title.slice(0, 60)} | PKR ${e.price} was ${e.was} | own history: ${e.truth}, ${e.basis}: ${e.said}`);
}

if (process.argv.includes("--record")) {
  const md = `# Discount verdicts without a listing's own history: are they right?

Written by \`src/scripts/ml/discount/04-check-new-evidence.js\` on ${new Date().toISOString().slice(0, 10)}.

Since 2026-11-08 a claim whose listing has too little history of its own is judged on other evidence
(\`ranking/dealScore.js\` \`judgeWithMoreEvidence\`): first the same product's history at the other stores, then the fair price for
its specs (\`FAIR_PRICE_REPORT.md\`). That cut the "unverified" claims from 54.7% to 6.2%. This checks that those verdicts are right.

**How.** For every claim the listing's own history can judge (did this store actually sell at its "was" price?), that history is
hidden and the claim is judged as a listing without history is. The other stores' histories leave out this listing's own, so the
answer cannot leak in. Genuine and likely genuine count as one side, suspicious and likely fake as the other.

${summary}

${table}

**Reading it.** "Judged" is how often the evidence reached a verdict instead of staying unverified; "same side" is how often that
verdict agreed with the listing's own history. The listing's own history is the direct evidence, so it is taken as the answer here,
though it can be wrong too (a store that sold at its "was" price for a day, long ago).

${examples.length ? `## Disagreements (the first ${examples.length})\n\n| Store | Listing | Price | "Was" | Own history | Without it |\n|---|---|---:|---:|---|---|\n${examples.map((e) => `| ${e.platform} | ${e.title.slice(0, 70).replace(/\|/g, "/")} | ${e.price.toLocaleString("en-US")} | ${e.was.toLocaleString("en-US")} | ${e.truth} | ${e.said} (${e.basis}) |`).join("\n")}\n` : ""}`;
  writeFileSync(OUT, md);
  console.log(`\nwritten ${OUT}`);
}
process.exit(0);
