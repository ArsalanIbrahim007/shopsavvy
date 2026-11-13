// clean-spec-sheets.js — corrects stored specification sheets after a fix to the Specs engine's reading (src/specs/normalize.js).
//
// 2026-11-10: a thousands comma was read as a break ("3,692 mAh" stored as 692), and a core count was taken for a chip ("Octa-Core",
// "6-core CPU"; "6 Core Apple A18 Pro" for "Apple A18 Pro"). A chipset is read again from its own stored text; a phone's or tablet's
// battery under 1,500 mAh cannot be one, so it is removed, and the same model's other sheets or the next page check fill it in.
//
//   node src/scripts/maintenance/clean-spec-sheets.js            dry run: what would change
//   node src/scripts/maintenance/clean-spec-sheets.js --apply    write the changes

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import Listing from "../../models/listing.model.js";
import { normalizeSpecs } from "../../specs/normalize.js";

const apply = process.argv.includes("--apply");
const HANDHELD = new Set(["smartphone", "tablet"]);

await mongoose.connect(process.env.MONGO_URI);
try {
  const rows = await Listing.find({ specSheet: { $ne: null } }, { specSheet: 1, productCategory: 1 }).lean();
  const ops = [];
  const tally = { chipsetRenamed: 0, chipsetRemoved: 0, batteryRemoved: 0 };
  for (const row of rows) {
    const sheet = { ...row.specSheet };
    let changed = false;
    if (sheet.chipset) {
      const read = normalizeSpecs({ Processor: sheet.chipset });
      if (!read.chipset) {
        delete sheet.chipset;
        delete sheet.chipsetTier;
        tally.chipsetRemoved += 1;
        changed = true;
      } else if (read.chipset !== sheet.chipset || read.chipsetTier !== sheet.chipsetTier) {
        sheet.chipset = read.chipset;
        if (read.chipsetTier) sheet.chipsetTier = read.chipsetTier;
        else delete sheet.chipsetTier;
        tally.chipsetRenamed += 1;
        changed = true;
      }
    }
    // 2026-11-12: an operating system must name one ("Snapdragon 7s Gen 4 5G" was stored as one); a chipset listing two chips is gone
    // through the chipset re-read above.
    if (sheet.os && !normalizeSpecs({ OS: sheet.os }).os) {
      delete sheet.os;
      tally.osRemoved = (tally.osRemoved ?? 0) + 1;
      changed = true;
    }
    if (HANDHELD.has(row.productCategory) && Number(sheet.batteryMah) < 1500) {
      delete sheet.batteryMah;
      tally.batteryRemoved += 1;
      changed = true;
    }
    if (changed) ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: { specSheet: Object.keys(sheet).length ? sheet : null } } } });
  }
  console.log(`${rows.length} sheets read: ${ops.length} to correct (chipset renamed ${tally.chipsetRenamed}, chipset removed ${tally.chipsetRemoved}, battery removed ${tally.batteryRemoved}, os removed ${tally.osRemoved ?? 0}).`);
  if (apply && ops.length) {
    const result = await Listing.bulkWrite(ops, { ordered: false });
    console.log(`Written: ${result.modifiedCount} listings.`);
  } else if (!apply) {
    console.log("Dry run: nothing written. Add --apply to write these changes.");
  }
} finally {
  await mongoose.disconnect();
}
