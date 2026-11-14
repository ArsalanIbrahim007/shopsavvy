// The database backup (services/backup.service.js) and its restore (scripts/ops/restore-database.js), 2026-11-15.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { BSON, ObjectId } from "mongodb";

import { backupDatabase, backupStamp } from "../src/services/backup.service.js";

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

// a stand-in for the driver's Db: two collections, one document with an id and a date
const fakeDb = (docs) => ({
  databaseName: "shopsavvy",
  listCollections: () => ({ toArray: async () => Object.keys(docs).map((name) => ({ name })) }),
  collection: (name) => ({ find: () => docs[name] }),
});

describe("backing up the database", () => {
  it("writes each collection as gzipped Extended JSON with a manifest, ids and dates keeping their types", async () => {
    dir = mkdtempSync(join(tmpdir(), "backup-"));
    const id = new ObjectId();
    const at = new Date("2026-11-14T20:00:00Z");
    const { folder, collections } = await backupDatabase(fakeDb({ listings: [{ _id: id, price: 74739, lastScrapedAt: at }], pricealerts: [] }), { target: dir, now: at });
    expect(collections).toEqual({ listings: 1, pricealerts: 0 });
    expect(JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")).collections).toEqual(collections);
    const line = gunzipSync(readFileSync(join(folder, "listings.jsonl.gz"))).toString().trim();
    const back = BSON.EJSON.parse(line, { relaxed: false });
    expect(back._id).toBeInstanceOf(ObjectId);
    expect(back._id.equals(id)).toBe(true);
    expect(back.lastScrapedAt).toBeInstanceOf(Date);
    expect(back.lastScrapedAt.getTime()).toBe(at.getTime());
  });

  it("keeps the newest backups only, and never touches a folder not named like one", async () => {
    dir = mkdtempSync(join(tmpdir(), "backup-"));
    for (const old of ["2026-11-01-22-00", "2026-11-02-22-00", "2026-11-03-22-00", "my notes"]) mkdirSync(join(dir, old));
    const { removed } = await backupDatabase(fakeDb({ listings: [] }), { target: dir, keep: 2, now: new Date("2026-11-04T17:00:00Z") });
    expect(removed).toEqual(["2026-11-01-22-00", "2026-11-02-22-00"]);
    expect(readdirSync(dir).sort()).toEqual(["2026-11-03-22-00", backupStamp(new Date("2026-11-04T17:00:00Z")), "my notes"].sort());
  });
});
