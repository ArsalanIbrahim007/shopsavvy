// 06-compare-grouping.js — runs groupListingsByProduct over the entire live
// database with both the rule-based and trained-classifier match
// strategies, and reports where they produce different groupings. A live-
// data demo artifact: "here's what changes if we flip the switch," not a
// judgment on which is right for every case (see EVALUATION_REPORT.md for
// the quantified comparison against ground truth).
//
// Usage: node src/scripts/ml/06-compare-grouping.js ["search query"]
// With no argument, runs across the whole database, grouped by category to
// keep group-formation meaningful (matches how the real search endpoint
// scopes grouping to one category at a time).

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";

const queryFilter = process.argv[2];

await mongoose.connect(process.env.MONGO_URI);
const collection = mongoose.connection.db.collection("listings");

const filter = queryFilter
  ? { title: { $regex: queryFilter, $options: "i" } }
  : {};

const listings = await collection.find(filter).toArray();
console.log(`Loaded ${listings.length} listings${queryFilter ? ` matching "${queryFilter}"` : ""}.\n`);

const byCategory = new Map();
for (const l of listings) {
  const cat = l.productCategory || "other";
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(l);
}

let totalRuleGroups = 0;
let totalMlGroups = 0;
const rows = [];

for (const [category, items] of byCategory) {
  const ruleGroups = groupListingsByProduct(items);
  const mlGroups = groupListingsByProduct(items, { matchStrategy: mlMatchStrategy });

  totalRuleGroups += ruleGroups.length;
  totalMlGroups += mlGroups.length;

  rows.push({
    category,
    listings: items.length,
    ruleGroups: ruleGroups.length,
    mlGroups: mlGroups.length,
    delta: mlGroups.length - ruleGroups.length,
  });
}

console.log("Per-category group counts (rule vs trained classifier):");
console.table(rows.sort((a, b) => b.listings - a.listings));

console.log(`\nTotals: ${listings.length} listings → ${totalRuleGroups} rule-based groups, ${totalMlGroups} ML-based groups.`);
console.log(
  totalMlGroups < totalRuleGroups
    ? `The trained classifier merges ${totalRuleGroups - totalMlGroups} more listings into existing groups than the fixed threshold does (higher recall, per EVALUATION_REPORT.md).`
    : totalMlGroups > totalRuleGroups
      ? `The trained classifier splits ${totalMlGroups - totalRuleGroups} more groups than the fixed threshold does.`
      : "Both strategies produce the same number of groups on this data."
);

await mongoose.disconnect();
