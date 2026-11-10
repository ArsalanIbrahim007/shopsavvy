// fill-specs.js — reads the specifications of the products shoppers compare most, one store page per product.
//
// The nightly page check reads pages oldest first, a few each night, so a popular phone could wait weeks for its specifications while
// one-store listings nobody compares were read (2026-11-10: the Compare page showed mostly dashes). This takes each category's
// products as the site groups them, most offers first (the catalog's "most compared" order), and for every product whose stores'
// pages have not yet given a specification sheet picks ONE of its offers to read: from the store whose pages state the most (PriceOye
// first for phones and tablets, Paklap for laptops), skipping a store whose page for that product was already read and gave nothing.
// One page is enough: the sheet is shared by every offer of the product (specsEngine mergeSpecSheets).
//
//   node src/scripts/maintenance/fill-specs.js --dry                     which pages it would read, and nothing else
//   node src/scripts/maintenance/fill-specs.js --top=400                 read for the 400 most compared products of each category
//   node src/scripts/maintenance/fill-specs.js --store=priceoye          only the pages of one store (run one per store side by side:
//                                                                        each asks only its own store, one page every --delay ms)
// Options: --category=ID (repeatable; default smartphone, tablet, laptop), --top=N (default 400), --store=ID, --delay=MS (default 2500).

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../../config/platforms.js";
import Listing from "../../models/listing.model.js";
import { enrichFromPages } from "../../services/pageEnrichment.service.js";
import { groupListingsByProduct } from "../../services/productGrouping.service.js";
import { mlMatchStrategy } from "../../services/similarityModel.service.js";
import { clearModelIndex, mergeSpecSheets, modelKeyOf, withModelSpecs } from "../../services/specsEngine.service.js";
import { SPEC_STORES } from "../../specs/extractors.js";

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const categories = arg("category").length ? arg("category") : ["smartphone", "tablet", "laptop"];
const top = Number(arg("top")[0] ?? 400);
const onlyStore = arg("store")[0]?.toLowerCase() ?? null;
const delayMs = Number(arg("delay")[0] ?? 2500);
const dry = process.argv.includes("--dry");

// Pages read before the readers worked (2026-11-09 evening) found nothing anywhere; only a later read that found nothing counts.
const READERS_SINCE = new Date("2026-11-09T12:00:00Z");
const MIN_MODEL_FIELDS = 6;

// Which store's page to read first: the ones whose pages state the most (read 2026-11-09).
const PREFERENCE = {
  laptop: ["paklap", "priceoye", "digimall", "shophive", "ishopping", "techroid", "eezepc"],
  default: ["priceoye", "digimall", "ishopping", "techroid", "eezepc", "shophive", "paklap"],
};

await mongoose.connect(process.env.MONGO_URI);
clearModelIndex();
try {
  const picked = [];
  for (const category of categories) {
    const listings = await Listing.find({ ...VISIBLE_PLATFORMS_FILTER, isActive: true, productCategory: category }).lean();
    const groups = groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy }).slice(0, top);
    const order = PREFERENCE[category] ?? PREFERENCE.default;
    let lacking = 0;
    // Specifications belong to a model, so a model is read once, from any of its variants (2026-11-10: a 512 GB iPhone 17 Pro
    // showed dashes though its 256 GB had been read): the listings of the whole category by model key.
    const byModel = new Map();
    for (const listing of listings) {
      const key = modelKeyOf(listing.title, category);
      if (!key) continue;
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key).push(listing);
    }
    const done = new Set();
    for (const group of groups) {
      const lead = group.bestDeal ?? group.offers[0];
      const key = modelKeyOf(lead?.title, category);
      if (!key || done.has(key)) continue;
      done.add(key);
      const variants = byModel.get(key) ?? group.offers;
      // Covered: the model's sheets together state at least MIN_MODEL_FIELDS specifications besides RAM and storage.
      const { specs } = await withModelSpecs(mergeSpecSheets(group.offers).specs, [], lead);
      const known = Object.keys(specs ?? {}).filter((field) => field !== "ramGb" && field !== "storageGb").length;
      if (known >= MIN_MODEL_FIELDS) continue;
      lacking += 1;
      // A store whose page for this model was read by the working readers and stated nothing is not asked again.
      const readable = variants.filter((o) => SPEC_STORES.includes(o.platform) && !o.specSheet);
      const tried = new Set(variants.filter((o) => SPEC_STORES.includes(o.platform) && !o.specSheet && new Date(o.pageCheckedAt ?? 0) >= READERS_SINCE).map((o) => o.platform));
      const read = new Set(variants.filter((o) => o.specSheet).map((o) => o.platform)); // a store whose page already gave its sheet
      const choice = order.map((store) => readable.find((o) => o.platform === store && !tried.has(store) && !read.has(store))).find(Boolean);
      if (choice && (!onlyStore || choice.platform === onlyStore)) picked.push({ id: String(choice._id), platform: choice.platform, title: choice.title, category });
    }
    console.log(`${category}: of the ${groups.length} most compared products, ${lacking} models have fewer than ${MIN_MODEL_FIELDS} specifications`);
  }
  const byStore = picked.reduce((a, p) => ((a[p.platform] = (a[p.platform] ?? 0) + 1), a), {});
  console.log(`pages to read: ${picked.length} (${Object.entries(byStore).map(([s, n]) => `${s} ${n}`).join(", ")})`);
  if (dry) {
    for (const p of picked.slice(0, 15)) console.log(`  ${p.category} ${p.platform}: ${p.title}`);
  } else if (picked.length) {
    const summary = await enrichFromPages({ ids: picked.map((p) => p.id), limit: picked.length, delayMs, again: true, log: console.log });
    console.log(`\nRead ${summary.checked} pages: ${summary.withSpecs} gave specifications; ${summary.failed} could not be read.`);
  }
} finally {
  await mongoose.disconnect();
  process.exit(0); // the headless browser (iShopping, Paklap) would otherwise keep the process alive
}
