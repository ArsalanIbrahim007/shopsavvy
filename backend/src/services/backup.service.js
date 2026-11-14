// backup.service.js — the whole database written to compressed files (backup-database.js by hand; the nightly scrape after its run).
//
// One file per collection, <name>.jsonl.gz: one document per line in MongoDB's Extended JSON (dates and ids keep their types),
// gzip-compressed (157 MB of data gave 15 MB on 2026-11-15). manifest.json lists every collection with its count, so a restore
// (restore-database.js) checks nothing is missing. Reads only; needs no MongoDB tools installed. The settings file backend\.env is
// not included: it holds passwords (deploy/BACKUP.md).

import { createWriteStream, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import { BSON } from "mongodb";

// Where backups go unless BACKUP_DIR says otherwise: outside the project, on this PC's data drive.
export const DEFAULT_BACKUP_DIR = "D:\\ShopSavvy-backups";
const BACKUP_FOLDER = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/;

/** This PC's local date and time as a folder name, 2026-11-15-09-30. */
export function backupStamp(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[T:]/g, "-");
}

/**
 * Writes every collection of `db` to <target>\<stamp>\, then, with `keep`, deletes all but the newest `keep` backup folders there
 * (only folders named like a backup). Returns { folder, collections: {name: count}, removed: [folder names] }.
 */
export async function backupDatabase(db, { target = DEFAULT_BACKUP_DIR, keep = null, now = new Date(), log = () => {} } = {}) {
  const folder = join(target, backupStamp(now));
  mkdirSync(folder, { recursive: true });
  const manifest = { database: db.databaseName, createdAt: now.toISOString(), collections: {} };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.")) continue;
    const gzip = createGzip({ level: 9 });
    const out = createWriteStream(join(folder, `${name}.jsonl.gz`));
    gzip.pipe(out);
    let count = 0;
    for await (const document of db.collection(name).find({}, { batchSize: 1000 })) {
      if (!gzip.write(`${BSON.EJSON.stringify(document, { relaxed: false })}\n`)) await once(gzip, "drain");
      count += 1;
    }
    gzip.end();
    await once(out, "finish");
    manifest.collections[name] = count;
    log(`${name.padEnd(16)} ${String(count).padStart(7)} documents`);
  }
  writeFileSync(join(folder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const removed = [];
  if (keep) {
    const backups = readdirSync(target, { withFileTypes: true }).filter((e) => e.isDirectory() && BACKUP_FOLDER.test(e.name)).map((e) => e.name).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
      rmSync(join(target, old), { recursive: true, force: true });
      removed.push(old);
    }
  }
  return { folder, collections: manifest.collections, removed };
}
