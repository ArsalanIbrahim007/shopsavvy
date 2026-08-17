// check-platform.js — shows what each platform has contributed
//   node check-platform.js            (all platforms)
//   node check-platform.js w11stop    (one platform, with sample titles)

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

const only = process.argv[2];

await mongoose.connect(process.env.MONGO_URI);
const listings = mongoose.connection.db.collection("listings");

if (!only) {
  const rows = await listings
    .aggregate([
      { $group: { _id: "$platform", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  console.log("Listings per platform:\n");
  rows.forEach((r) => console.log(`  ${String(r._id).padEnd(12)} ${r.n}`));
} else {
  const total = await listings.countDocuments({ platform: only });
  console.log(`${only}: ${total} listings\n`);

  const cats = await listings
    .aggregate([
      { $match: { platform: only } },
      { $group: { _id: "$productCategory", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  console.log("by category:");
  cats.forEach((c) => console.log(`  ${String(c._id).padEnd(12)} ${c.n}`));

  const sample = await listings
    .find({ platform: only })
    .sort({ price: -1 })
    .limit(15)
    .toArray();

  console.log("\nsample titles:");
  sample.forEach((l) =>
    console.log(`  ${String(l.price).padStart(8)}  ${String(l.title).slice(0, 62)}`)
  );
}

await mongoose.disconnect();