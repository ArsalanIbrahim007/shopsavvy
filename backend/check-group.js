// check-group.js — shows why two listings did or did not group
//   node check-group.js "iphone 16 pro max"

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";
import Listing from "./src/models/listing.model.js";
import {
  normalizeTitle, extractStorage, extractScreenInches,
  extractPtaStatus, extractModelCodes, modelTokens,
} from "./src/services/normalizeTitle.service.js";
import { isSimilarProduct, calculateJaccardSimilarity } from "./src/services/similarity.service.js";

const query = process.argv[2] || "iphone 16 pro max";

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find({
  title: { $regex: query, $options: "i" },
}).sort({ price: 1 }).lean();

console.log(`Matching listings: ${listings.length}\n`);

listings.forEach((l) => {
  console.log(`${String(l.price).padStart(8)}  ${l.platform.padEnd(10)} ${l.title}`);
  console.log(
    `          storage=${extractStorage(l.title)}  ` +
    `pta=${extractPtaStatus(l.title)}  ` +
    `inches=${extractScreenInches(l.title)}  ` +
    `codes=[${[...extractModelCodes(l.title)].join(",")}]  ` +
    `model="${modelTokens(l.title)}"`
  );
});

console.log("\nPAIRWISE DECISIONS");
for (let i = 0; i < listings.length; i++) {
  for (let j = i + 1; j < listings.length; j++) {
    const a = listings[i].title;
    const b = listings[j].title;
    const grouped = isSimilarProduct(a, b, 0.7);
    const sim = calculateJaccardSimilarity(modelTokens(a), modelTokens(b)).toFixed(2);
    console.log(
      `${grouped ? "GROUPED " : "separate"}  sim=${sim}  ` +
      `${listings[i].price} vs ${listings[j].price}`
    );
  }
}

await mongoose.disconnect();