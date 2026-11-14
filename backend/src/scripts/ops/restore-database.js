// restore-database.js — loads a backup made by backup-database.js into a MongoDB database.
//
//   node src/scripts/ops/restore-database.js "<backup folder>"                         into MONGO_URI's database
//   node src/scripts/ops/restore-database.js "<backup folder>" "<mongodb address>"     into another database (Atlas, a new PC)
//   ... --replace                                                                    empty those collections first
//
// Refuses to write into a collection that already holds documents unless --replace is given, so a restore cannot mix two
// databases by accident. After loading, it compares every collection's count with the backup's manifest.json and says so.
// The indexes are built by the API itself when it starts (config/indexes.js).

import { config } from "dotenv";
config({ quiet: true });
import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import mongoose from "mongoose";
import { BSON } from "mongodb";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const replace = process.argv.includes("--replace");
const [folder, address = process.env.MONGO_URI] = args;
if (!folder) {
  console.error('Usage: node src/scripts/ops/restore-database.js "<backup folder>" ["<mongodb address>"] [--replace]');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));

await mongoose.connect(address);
try {
  const db = mongoose.connection.db;
  for (const name of Object.keys(manifest.collections)) {
    const collection = db.collection(name);
    const existing = await collection.estimatedDocumentCount();
    if (existing > 0 && !replace) {
      console.error(`${name} already holds ${existing} documents: nothing restored. Add --replace to empty it first.`);
      process.exitCode = 1;
      continue;
    }
    if (existing > 0) await collection.deleteMany({});
    const lines = createInterface({ input: createReadStream(join(folder, `${name}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity });
    let batch = [];
    let loaded = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      batch.push(BSON.EJSON.parse(line, { relaxed: false }));
      if (batch.length === 1000) {
        await collection.insertMany(batch, { ordered: false });
        loaded += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await collection.insertMany(batch, { ordered: false });
      loaded += batch.length;
    }
    const expected = manifest.collections[name];
    const ok = loaded === expected;
    if (!ok) process.exitCode = 1;
    console.log(`${name.padEnd(16)} ${String(loaded).padStart(7)} of ${expected} ${ok ? "ok" : "MISSING SOME"}`);
  }
  console.log(`\nRestored into "${db.databaseName}" from the backup of ${manifest.createdAt}.`);
} finally {
  await mongoose.disconnect();
}
