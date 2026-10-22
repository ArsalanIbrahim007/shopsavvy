// 09-recheck-group-merges.js — B9, step 3: after a change to the matcher, regroup the live catalogue and check it against the labelled
// sample (07, 08) and against the grouping before the change.
//
// For each labelled merge it asks whether the two offers are still in one group: a "different" merge now split is a fix, a "same"
// merge now split is a loss. Precision is then recomputed over the merges that remain. That alone would hide new mistakes (a veto can
// send an offer into another group), so with --against it also lists every pair of offers that is together now but was not before,
// and every pair that was together and is now split, for a person to read.
//
//   node src/scripts/ml/09-recheck-group-merges.js --save=before.json        snapshot the current grouping
//   node src/scripts/ml/09-recheck-group-merges.js --against=before.json     compare with a snapshot, and with the labels
//       --show=<regex>   also print the groups, before and now, holding a matching title
//       --record         keep the result in src/ml/dataset/group_merges.recheck.json for the report
//
// The snapshot holds offer URLs only. Offers are identified by URL, so an offer the nightly scrape has removed since the sample was
// drawn is reported as gone, not as split.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { closeGroupingPool, groupListings } from "../../services/grouping.service.js";
import { tally } from "./08-score-group-merges.js";
import { mergeSet } from "./mergeSets.js";

const ML = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const urlOf = (offer) => offer.productUrl || offer.sourceUrl || null;

/** Every unordered pair of offers that share a group, as "urlA\turlB" (sorted), from { category: [[url, ...], ...] }. */
export function togetherPairs(groupsByCategory) {
  const pairs = new Set();
  for (const groups of Object.values(groupsByCategory)) {
    for (const urls of groups) {
      const sorted = [...urls].sort();
      for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) pairs.add(`${sorted[i]}\t${sorted[j]}`);
    }
  }
  return pairs;
}

/** For each labelled merge: "kept" (still one group), "split" or "gone" (an offer is no longer listed). */
export function recheck(merges, groupsByCategory) {
  const groupOf = new Map(); // url -> group number, unique across categories
  let n = 0;
  for (const groups of Object.values(groupsByCategory)) for (const urls of groups) { n += 1; for (const u of urls) groupOf.set(u, n); }
  return merges.map((m) => {
    const a = groupOf.get(m.main.url);
    const b = groupOf.get(m.offer.url);
    return { id: m.id, state: a === undefined || b === undefined ? "gone" : a === b ? "kept" : "split" };
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const SET = mergeSet(); // --set=core (the default) or --set=appliances: see mergeSets.js
  await mongoose.connect(process.env.MONGO_URI);
  const started = Date.now();
  const groupsByCategory = {};
  const titleOf = new Map();
  for (const category of SET.categories) {
    const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category }).lean();
    const groups = await groupListings(listings, { strategy: "ml", recommend: false, priority: "background", timeoutMs: 20 * 60 * 1000 });
    groupsByCategory[category] = groups.map((g) => g.offers.map(urlOf).filter(Boolean));
    for (const l of listings) titleOf.set(urlOf(l), `${l.platform} ${l.price} ${l.title}`);
    console.log(`${category.padEnd(11)} ${String(listings.length).padStart(5)} listings, ${String(groups.length).padStart(5)} groups`);
  }
  await closeGroupingPool();
  await mongoose.disconnect();
  console.log(`grouped in ${Math.round((Date.now() - started) / 1000)} s`);

  const save = arg("save");
  if (save) {
    writeFileSync(save, JSON.stringify({ at: new Date().toISOString(), groupsByCategory }));
    console.log(`snapshot -> ${save}`);
  }

  const sample = JSON.parse(readFileSync(join(ML, "dataset", `${SET.file}.sample.json`), "utf8"));
  const labels = JSON.parse(readFileSync(join(ML, "dataset", `${SET.file}.labels.json`), "utf8"));
  const states = recheck(sample.merges, groupsByCategory);
  const byLabel = {};
  for (const s of states) {
    const key = `${labels[s.id] ?? "unlabelled"} ${s.state}`;
    (byLabel[key] ??= []).push(s.id);
  }
  console.log("\nLabelled sample against this grouping:");
  for (const [key, ids] of Object.entries(byLabel).sort()) console.log(`  ${key.padEnd(18)} ${String(ids.length).padStart(3)}  ${ids.join(" ")}`);
  const kept = new Set(states.filter((s) => s.state === "kept").map((s) => s.id));
  const t = tally(sample.merges.filter((m) => kept.has(m.id)).map((m) => ({ verdict: labels[m.id] ?? null })));
  console.log(`  precision over the merges still made: ${t.same}/${t.judged} = ${(100 * t.precision).toFixed(1)}%`);

  const record = { at: new Date().toISOString(), states };
  const against = arg("against");
  if (against) {
    const before = JSON.parse(readFileSync(against, "utf8")).groupsByCategory;
    const was = togetherPairs(before);
    const now = togetherPairs(groupsByCategory);
    const show = (pair) => pair.split("\t").map((u) => titleOf.get(u) ?? u).join("\n      ");
    const added = [...now].filter((p) => !was.has(p));
    const removed = [...was].filter((p) => !now.has(p));
    const count = (g) => Object.values(g).reduce((s, groups) => s + groups.length, 0);
    console.log(`\nGroups: ${count(before)} before, ${count(groupsByCategory)} now. Pairs together: ${was.size} before, ${now.size} now.`);
    console.log(`\nNewly together (${added.length}):`);
    for (const p of added) console.log(`    ${show(p)}`);
    console.log(`\nNewly apart (${removed.length}):`);
    for (const p of removed) console.log(`    ${show(p)}`);

    // The same change as whole groups, easier to read: each group of two or more offers that did not exist before, with the groups
    // its offers were in before.
    const key = (urls) => [...urls].sort().join("\n");
    const beforeKeys = new Set(Object.values(before).flat().map(key));
    const beforeOf = new Map();
    for (const urls of Object.values(before).flat()) for (const u of urls) beforeOf.set(u, urls);
    const changed = Object.values(groupsByCategory).flat().filter((urls) => urls.length > 1 && !beforeKeys.has(key(urls)));
    Object.assign(record, {
      groupsBefore: count(before), groupsNow: count(groupsByCategory), pairsBefore: was.size, pairsNow: now.size,
      newlyTogether: added.length, newlyApart: removed.length, changedGroups: changed.length,
    });
    console.log(`\nChanged groups (${changed.length}):`);
    for (const urls of changed) {
      console.log(`  NOW  ${urls.map((u) => titleOf.get(u) ?? u).sort().join("\n       ")}`);
      const was = [...new Set(urls.map((u) => beforeOf.get(u)).filter(Boolean))];
      for (const w of was) console.log(`  WAS  ${w.map((u) => titleOf.get(u) ?? u).sort().join("\n       ")}`);
      console.log("");
    }

    // --show=<regex>: the groups, before and now, holding an offer whose title matches.
    const pattern = arg("show") ? new RegExp(arg("show"), "i") : null;
    if (pattern) {
      for (const [label, grouping] of [["before", before], ["now", groupsByCategory]]) {
        console.log(`\nGroups ${label} matching ${pattern}:`);
        for (const urls of Object.values(grouping).flat()) {
          if (!urls.some((u) => pattern.test(titleOf.get(u) ?? ""))) continue;
          console.log(`  - ${urls.map((u) => titleOf.get(u) ?? u).sort().join("\n    ")}`);
        }
      }
    }
  }

  // --record: keep the result for the report (08-score-group-merges.js prints it under "After the matcher fixes").
  if (process.argv.includes("--record")) {
    writeFileSync(join(ML, "dataset", `${SET.file}.recheck.json`), JSON.stringify(record, null, 2));
    console.log(`\nrecorded -> src/ml/dataset/${SET.file}.recheck.json`);
  }
  process.exit(0);
}
