// check-attributes.js — reports coverage of the extracted attributes
import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const listings = mongoose.connection.db.collection("listings");

const total = await listings.countDocuments();
console.log(`Total listings: ${total}\n`);

async function distribution(field) {
  const rows = await listings
    .aggregate([
      { $match: { [field]: { $ne: null } } },
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  const covered = rows.reduce((sum, r) => sum + r.n, 0);
  console.log(`${field}  (${covered}/${total} populated)`);

  rows.slice(0, 10).forEach((r) =>
    console.log(`   ${String(r._id).padEnd(14)} ${r.n}`)
  );
  console.log();
}

for (const field of [
  "resolution",
  "screenInches",
  "storageGb",
  "ptaStatus",
  "colour",
  "productCategory",
]) {
  await distribution(field);
}

await mongoose.disconnect();