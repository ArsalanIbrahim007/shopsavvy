// pack.mjs — the extension as a .zip (2026-11-27): the file to upload to the Chrome Web Store and Edge Add-ons, and the one the
// website offers for download (frontend/public/shopsavvy-extension.zip, /extension page) until the store listing is live.
//
//   node extension/pack.mjs
//
// Writes extension/dist/shopsavvy-extension-<version>.zip and frontend/public/shopsavvy-extension.zip. Only what the extension runs
// goes in (manifest, scripts, popup, icons): not this script, the README, the lint config or dist/. Nothing to install: the zip
// is written with Node's own zlib (deflate and CRC-32).
import { deflateRawSync, crc32 } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const LEAVE_OUT = new Set(["pack.mjs", "README.md", "STORE_LISTING.md", "eslint.config.js", "dist", "node_modules", ".DS_Store"]);

function filesIn(dir) {
  return readdirSync(dir).filter((name) => !LEAVE_OUT.has(name)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

// A fixed time for every entry, so the same files always give the same zip (01 Jan 2026, 00:00).
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const packed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const { version } = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const entries = filesIn(here)
  .map((path) => ({ name: relative(here, path).split("\\").join("/"), data: readFileSync(path) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const archive = zip(entries);

mkdirSync(join(here, "dist"), { recursive: true });
const forStore = join(here, "dist", `shopsavvy-extension-${version}.zip`);
const forSite = join(here, "..", "frontend", "public", "shopsavvy-extension.zip");
writeFileSync(forStore, archive);
writeFileSync(forSite, archive);
console.log(`ShopSavvy extension ${version}: ${entries.length} files, ${(archive.length / 1024).toFixed(1)} KB`);
for (const { name } of entries) console.log(`  ${name}`);
console.log(`-> ${relative(process.cwd(), forStore)}\n-> ${relative(process.cwd(), forSite)}`);
