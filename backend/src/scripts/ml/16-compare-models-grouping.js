// 16-compare-models-grouping.js — what changes on the site if the live matcher is replaced: every listing the site shows, grouped
// category by category with the live model and with a candidate, and the differences written out for reading.
//
// Read-only: it never writes to the database. Each model runs in its own child process (the model file is loaded once per
// process, chosen by SHOPSAVVY_MATCH_MODEL), and the parent compares the two groupings:
//   - new merges: pairs of listings the candidate puts together and the live model keeps apart (the ones to read for wrong merges);
//   - lost merges: pairs the live model puts together and the candidate splits.
//
// Usage: node src/scripts/ml/16-compare-models-grouping.js [candidate=model.artifact.v4-nov.json]
// Output: src/ml/GROUPING_CHANGES_V4.md and src/ml/dataset/grouping_changes_v4.json (every changed pair, for labelling)

import { config } from "dotenv";
config({ quiet: true });
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const ML_DIR = join(dirname(__filename), "..", "..", "ml");

if (process.argv[2] === "--child") {
  // Child: group every visible listing with the model SHOPSAVVY_MATCH_MODEL names, write [category, [[id, ...], ...]] to argv[3].
  const mongoose = (await import("mongoose")).default;
  const { groupListingsByProduct } = await import("../../services/productGrouping.service.js");
  const { mlMatchStrategy } = await import("../../services/similarityModel.service.js");
  const { VISIBLE_PLATFORMS_FILTER } = await import("../../config/platforms.js");
  await mongoose.connect(process.env.MONGO_URI);
  const listings = await mongoose.connection.db.collection("listings").find(VISIBLE_PLATFORMS_FILTER).toArray();
  const byCategory = new Map();
  for (const l of listings) {
    const c = l.productCategory || "other";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c).push(l);
  }
  const out = [];
  for (const [category, items] of byCategory) {
    const started = Date.now();
    const groups = groupListingsByProduct(items, { matchStrategy: mlMatchStrategy });
    out.push([category, groups.map((g) => (g.offers ?? []).map((l) => String(l._id ?? l.id)))]);
    console.error(`  ${process.env.SHOPSAVVY_MATCH_MODEL}: ${category} ${items.length} listings -> ${groups.length} groups, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  writeFileSync(process.argv[3], JSON.stringify(out));
  await mongoose.disconnect();
  process.exit(0);
}

const candidateFile = process.argv[2] || "model.artifact.v4-nov.json";
const tmp = mkdtempSync(join(tmpdir(), "regroup-"));
const run = (model) => {
  const file = join(tmp, `${model}.json`);
  execFileSync(process.execPath, [__filename, "--child", file], { env: { ...process.env, SHOPSAVVY_MATCH_MODEL: model }, stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 30 });
  return new Map(JSON.parse(readFileSync(file, "utf8")));
};
console.log("Grouping with the live model...");
const live = run("model.artifact.json");
console.log(`Grouping with ${candidateFile}...`);
const cand = run(candidateFile);

const pairsOf = (groups) => {
  const s = new Set();
  for (const ids of groups) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) s.add(ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`);
  return s;
};

const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGO_URI);
const col = mongoose.connection.db.collection("listings");
const rows = [];
const changes = [];
for (const [category, liveGroups] of live) {
  const candGroups = cand.get(category) ?? [];
  const lp = pairsOf(liveGroups), cp = pairsOf(candGroups);
  const added = [...cp].filter((p) => !lp.has(p)), lost = [...lp].filter((p) => !cp.has(p));
  rows.push({ category, liveGroups: liveGroups.length, candidateGroups: candGroups.length, newMergedPairs: added.length, lostMergedPairs: lost.length });
  for (const [kind, list] of [["new", added], ["lost", lost]]) for (const p of list) changes.push({ kind, category, ids: p.split("|") });
}
const ids = [...new Set(changes.flatMap((c) => c.ids))];
const docs = new Map((await col.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { title: 1, platform: 1, price: 1, sourceUrl: 1 } }).toArray()).map((d) => [String(d._id), d]));
const detailed = changes.map((c) => { const [a, b] = c.ids.map((id) => docs.get(id) ?? {}); return { ...c, titleA: a.title, titleB: b.title, platformA: a.platform, platformB: b.platform, priceA: a.price, priceB: b.price, urlA: a.sourceUrl, urlB: b.sourceUrl }; });
await mongoose.disconnect();

writeFileSync(join(ML_DIR, "dataset", "grouping_changes_v4.json"), JSON.stringify({ createdAt: new Date().toISOString(), candidate: candidateFile, changes: detailed }, null, 1));
const total = (k) => rows.reduce((s, r) => s + r[k], 0);
const md = [
  `# What changes on the site with ${candidateFile}`,
  "",
  `Generated ${new Date().toISOString()} by \`src/scripts/ml/16-compare-models-grouping.js\` (read-only). Every listing the site shows,`,
  "grouped category by category with the live model and with the candidate.",
  "",
  `Totals: live ${total("liveGroups")} groups, candidate ${total("candidateGroups")}; pairs newly put together ${total("newMergedPairs")}, pairs split apart ${total("lostMergedPairs")}.`,
  "",
  "| Category | Live groups | Candidate groups | Newly together (pairs) | Split apart (pairs) |",
  "|---|---|---|---|---|",
  ...rows.sort((a, b) => b.newMergedPairs - a.newMergedPairs).map((r) => `| ${r.category} | ${r.liveGroups} | ${r.candidateGroups} | ${r.newMergedPairs} | ${r.lostMergedPairs} |`),
  "",
  "Every changed pair is in `src/ml/dataset/grouping_changes_v4.json`, to be read (labelled) before any switch.",
];
writeFileSync(join(ML_DIR, "GROUPING_CHANGES_V4.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
