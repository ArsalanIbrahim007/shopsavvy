// backup-database.js — writes the whole ShopSavvy database to compressed files, to keep somewhere other than this PC.
//
//   node src/scripts/ops/backup-database.js                          to BACKUP_DIR (or D:\ShopSavvy-backups)\<date-time>\
//   node src/scripts/ops/backup-database.js "E:\Backups\ShopSavvy"   to <that folder>\<date-time>\
//
// The nightly scrape takes one too, after its run, keeping the newest 7 (run-scheduled-scrape.js). What is written, and how to
// restore it: services/backup.service.js, restore-database.js and deploy/BACKUP.md. backend\.env is not included (passwords).

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { backupDatabase, DEFAULT_BACKUP_DIR } from "../../services/backup.service.js";

const target = process.argv[2] ?? process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;

await mongoose.connect(process.env.MONGO_URI);
try {
  const { folder } = await backupDatabase(mongoose.connection.db, { target, log: console.log });
  console.log(`\nBackup written to ${folder}`);
  console.log("Copy that folder somewhere off this PC (Google Drive, a USB stick): a backup on the same disk does not survive the disk.");
} finally {
  await mongoose.disconnect();
}
