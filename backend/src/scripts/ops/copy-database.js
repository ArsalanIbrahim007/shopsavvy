// copy-database.js — copies the ShopSavvy database from one MongoDB to another, for moving the local one to MongoDB Atlas.
//
//   node --env-file=.env src/scripts/ops/copy-database.js "mongodb+srv://user:pass@cluster.mongodb.net/shopsavvy"
//   node --env-file=.env src/scripts/ops/copy-database.js "<target>" --replace     # empty the target's collections first
//
// Reads from MONGO_URI (the local database) and writes to the address given. Every collection is copied in batches, documents
// unchanged (ids included). It refuses to write into a target that already holds data unless --replace is given, so it cannot
// mix two databases by accident; with --replace it empties only the collections it copies. The indexes are built by the API
// itself when it starts (config/indexes.js). Needs no MongoDB tools installed.

import mongoose from "mongoose";

const BATCH = 1000;
const target = process.argv.find((a) => /^mongodb(\+srv)?:\/\//.test(a));
const replace = process.argv.includes("--replace");
if (!process.env.MONGO_URI || !target) {
  console.error('Usage: node --env-file=.env src/scripts/ops/copy-database.js "<target mongodb address>" [--replace]');
  process.exit(1);
}
const safe = (uri) => uri.replace(/\/\/[^@/]*@/, "//***@");
if (process.env.MONGO_URI === target) {
  console.error("The target is the source database.");
  process.exit(1);
}

const source = await mongoose.createConnection(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
const dest = await mongoose.createConnection(target, { serverSelectionTimeoutMS: 20000 }).asPromise();
console.log(`From ${safe(process.env.MONGO_URI)} (${source.db.databaseName}) to ${safe(target)} (${dest.db.databaseName})`);

const names = (await source.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith("system."));
const existing = new Set((await dest.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
for (const name of names) {
  if (existing.has(name) && (await dest.db.collection(name).estimatedDocumentCount()) > 0 && !replace) {
    console.error(`The target already holds "${name}". Run again with --replace to empty the copied collections first.`);
    process.exit(1);
  }
}

let total = 0;
for (const name of names) {
  const from = source.db.collection(name);
  const to = dest.db.collection(name);
  if (replace && existing.has(name)) await to.deleteMany({});
  const count = await from.estimatedDocumentCount();
  let copied = 0;
  let batch = [];
  for await (const doc of from.find({}, { batchSize: BATCH })) {
    batch.push(doc);
    if (batch.length === BATCH) {
      await to.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
      if (process.stdout.isTTY) process.stdout.write(`\r${name}: ${copied} of ${count}`);
    }
  }
  if (batch.length) await to.insertMany(batch, { ordered: false });
  copied += batch.length;
  total += copied;
  // Counted again at the end: a source still in use (a search saving listings) can grow during the copy.
  const [inTarget, inSource] = await Promise.all([to.countDocuments(), from.countDocuments()]);
  const note = inTarget === inSource ? "" : ` (the source now holds ${inSource}: it changed during the copy, or check this)`;
  console.log(`${process.stdout.isTTY ? "\r" : ""}${name}: ${copied} copied, ${inTarget} in the target${note}`);
}
console.log(`Done: ${total} documents in ${names.length} collections.`);
await source.close();
await dest.close();
