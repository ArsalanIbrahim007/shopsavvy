// 01-build-dataset.js — builds the feature dataset for the cross-store
// discount anomaly detector from the live database.
//
// Groups every listing into products with the trained matcher (per category,
// the same scoping the search endpoint uses), then builds one feature row for
// each offer that claims a discount and has at least one other store selling
// the same product. The rule-based classification is kept alongside each row
// as a weak reference label for evaluation — it is never used for training.
//
// Usage: node src/scripts/ml/discount/01-build-dataset.js

import { config } from "dotenv";
config({ quiet: true });
import fs from "node:fs";
import mongoose from "mongoose";

import { groupListingsByProduct } from "../../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../../services/similarityModel.service.js";
import { attachPriceHistory } from "../../../services/historyEnrichment.service.js";
import { buildDiscountFeatures, DISCOUNT_FEATURE_NAMES } from "../../../ml/discountFeatures.js";

const OUT = new URL("../../../ml/discount/dataset.json", import.meta.url);

await mongoose.connect(process.env.MONGO_URI);
const raw = await mongoose.connection.db.collection("listings").find({}).toArray();
const listings = await attachPriceHistory(raw);
console.log(`Loaded ${listings.length} listings.`);

const byCategory = new Map();
for (const l of listings) {
  const cat = l.productCategory || "other";
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(l);
}

const rows = [];
let claims = 0;
let claimsWithoutComparator = 0;

for (const [category, items] of byCategory) {
  const groups = groupListingsByProduct(items, { matchStrategy: mlMatchStrategy });

  for (const group of groups) {
    for (const offer of group.offers) {
      if (Number(offer.originalPrice) > Number(offer.price)) claims++;

      const built = buildDiscountFeatures(offer, group.offers);
      if (!built) {
        if (Number(offer.originalPrice) > Number(offer.price)) claimsWithoutComparator++;
        continue;
      }

      rows.push({
        id: String(offer._id),
        title: offer.title,
        platform: offer.platform,
        category,
        group: group.productName,
        groupSize: group.offers.length,
        features: built.features,
        context: built.context,
        historyCount: (offer.priceHistory || []).length,
        ruleClassification: offer.discountAnalysis?.classification ?? null,
      });
    }
  }
}

fs.mkdirSync(new URL(".", OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ builtAt: new Date().toISOString(), featureNames: DISCOUNT_FEATURE_NAMES, rows }, null, 1)
);

const comparatorBuckets = rows.reduce((acc, r) => {
  const k = r.context.comparators >= 3 ? "3+" : String(r.context.comparators);
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});
const ruleCounts = rows.reduce((acc, r) => {
  acc[r.ruleClassification] = (acc[r.ruleClassification] || 0) + 1;
  return acc;
}, {});

console.log(`Offers claiming a discount: ${claims}`);
console.log(`  ...with no other store selling the same product (skipped): ${claimsWithoutComparator}`);
console.log(`Dataset rows written: ${rows.length}`);
console.log("Rows by number of comparator offers:", comparatorBuckets);
console.log("Rule-based classification of those rows:", ruleCounts);

await mongoose.disconnect();
