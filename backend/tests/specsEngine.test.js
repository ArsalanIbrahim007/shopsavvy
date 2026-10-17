// specsEngine.service.js (the door to Muzammil's Specs engine) and the page check's use of it. The engine itself is not merged
// yet, so a fake one that follows the contract in context-muzammil.md stands in for it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  loadSpecsEngine, resetSpecsEngine, readSpecSheet, scoreSpecSheet, rankSpecScore, sanitizeSpecSheet, mergeSpecSheets, SPEC_CATEGORIES,
} from "../src/services/specsEngine.service.js";
import { enrichFromPages } from "../src/services/pageEnrichment.service.js";

const fakeEngine = (over = {}) => ({
  extractSpecs: (platform, html) => (platform === "priceoye" && html.includes("spec-table") ? { RAM: "8GB", Battery: "5000 mAh", Junk: "x" } : null),
  normalizeSpecs: (raw) => ({ ramGb: parseInt(raw.RAM, 10), batteryMah: parseInt(raw.Battery, 10), madeUp: 1 }),
  specScore: (sheet) => (Object.keys(sheet).length >= 2 ? { score: 70, parts: [{ field: "ramGb", points: 40, max: 50 }, { field: "batteryMah", points: 30, max: 50 }] } : null),
  rankInBand: (product, others) => ({ rank: 1 + others.filter((o) => o.score > product.score).length, of: others.length + 1 }),
  ...over,
});
const install = (engine) => loadSpecsEngine({ exists: () => true, importer: async () => engine });

beforeEach(() => resetSpecsEngine());
afterEach(() => { resetSpecsEngine(); vi.restoreAllMocks(); });

describe("loadSpecsEngine", () => {
  it("is null, quietly, while the engine is not merged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadSpecsEngine({ exists: () => false })).toBeNull();
    expect(await readSpecSheet("priceoye", "<div class=spec-table>")).toBeNull();
    expect(await scoreSpecSheet({ ramGb: 8 }, "smartphone")).toBeNull();
    expect(await rankSpecScore({ id: "a", score: 50, price: 1 }, [])).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("says so when the engine is there but cannot be loaded, or does not export the contract", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadSpecsEngine({ exists: () => true, importer: async () => { throw new Error("Cannot find package 'cheerio'"); } })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cheerio"));
    resetSpecsEngine();
    expect(await install({ extractSpecs: () => null })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("loads once", async () => {
    const importer = vi.fn(async () => fakeEngine());
    await loadSpecsEngine({ exists: () => true, importer });
    await loadSpecsEngine({ exists: () => true, importer });
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("sanitizeSpecSheet", () => {
  it("keeps only the canonical fields, of the right type and in a possible range", () => {
    expect(sanitizeSpecSheet({
      chipset: "  Snapdragon 8 Elite ", chipsetTier: "flagship", ramGb: 12, storageGb: 256, displayInches: 6.9, refreshHz: 120,
      displayType: "AMOLED", batteryMah: 5000, chargingW: 45, mainCameraMp: 200, frontCameraMp: 12, os: "Android 15", has5g: true,
      nfc: false, weightG: 218, price: 1, extra: "x",
    })).toEqual({
      chipset: "Snapdragon 8 Elite", chipsetTier: "flagship", ramGb: 12, storageGb: 256, displayInches: 6.9, refreshHz: 120,
      displayType: "AMOLED", batteryMah: 5000, chargingW: 45, mainCameraMp: 200, frontCameraMp: 12, os: "Android 15", has5g: true,
      nfc: false, weightG: 218,
    });
  });

  it("drops impossible or mistyped values, and gives null when nothing is left", () => {
    expect(sanitizeSpecSheet({ displayInches: 300, batteryMah: 0, ramGb: "8", has5g: "yes", chipsetTier: "best", displayType: "amoled", os: "", refreshHz: NaN }))
      .toBeNull();
    expect(sanitizeSpecSheet({ ramGb: 8, chipset: "x".repeat(81) })).toEqual({ ramGb: 8 });
    for (const bad of [null, undefined, "8GB", [1], 5]) expect(sanitizeSpecSheet(bad)).toBeNull();
  });
});

describe("readSpecSheet", () => {
  it("reads a page through the engine and checks what it gives", async () => {
    await install(fakeEngine());
    expect(await readSpecSheet("PriceOye", "<div class=spec-table>")).toEqual({ ramGb: 8, batteryMah: 5000 }); // madeUp dropped
    expect(await readSpecSheet("mega", "<div class=spec-table>")).toBeNull(); // no reader for that store
  });

  it("never lets an engine error out: it is logged and gives null", async () => {
    await install(fakeEngine({ extractSpecs: () => { throw new Error("selector gone"); } }));
    const log = vi.fn();
    expect(await readSpecSheet("priceoye", "<html>", { log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("selector gone"));
  });
});

describe("scoreSpecSheet and rankSpecScore", () => {
  it("pass the engine's answer through, checked", async () => {
    await install(fakeEngine());
    expect(await scoreSpecSheet({ ramGb: 8, batteryMah: 5000 }, "smartphone")).toEqual({ score: 70, parts: [{ field: "ramGb", points: 40, max: 50 }, { field: "batteryMah", points: 30, max: 50 }] });
    expect(await scoreSpecSheet({ ramGb: 8 }, "smartphone")).toBeNull(); // the engine's own "too few fields"
    expect(await scoreSpecSheet(null, "smartphone")).toBeNull();
    expect(await rankSpecScore({ id: "a", score: 70, price: 1 }, [{ id: "b", score: 80, price: 1 }])).toEqual({ rank: 2, of: 2 });
    expect(await rankSpecScore({ id: "a", score: null, price: 1 }, [])).toBeNull();
  });

  it("refuse a score outside 0 to 100, drop malformed parts, and survive an engine error", async () => {
    await install(fakeEngine({ specScore: () => ({ score: 140, parts: [] }) }));
    expect(await scoreSpecSheet({ ramGb: 8 }, "smartphone")).toBeNull();
    resetSpecsEngine();
    await install(fakeEngine({ specScore: () => ({ score: 50, parts: [{ field: "ramGb", points: 5, max: 10 }, { field: 1 }, null] }) }));
    expect(await scoreSpecSheet({ ramGb: 8 }, "smartphone")).toEqual({ score: 50, parts: [{ field: "ramGb", points: 5, max: 10 }] });
    resetSpecsEngine();
    await install(fakeEngine({ specScore: () => { throw new Error("x"); }, rankInBand: () => { throw new Error("y"); } }));
    expect(await scoreSpecSheet({ ramGb: 8 }, "smartphone")).toBeNull();
    expect(await rankSpecScore({ id: "a", score: 1, price: 1 }, [])).toBeNull();
  });
});

describe("mergeSpecSheets", () => {
  const offer = (id, platform, specSheet, day) => ({ _id: id, platform, specSheet, pageCheckedAt: new Date(Date.UTC(2026, 9, day)) });

  it("takes, per field, the value most stores give, and lists the stores", () => {
    const merged = mergeSpecSheets([
      offer("a", "priceoye", { ramGb: 8, batteryMah: 5000 }, 1),
      offer("b", "mega", { ramGb: 8, batteryMah: 4900, nfc: true }, 2),
      offer("c", "shophive", { ramGb: 12, batteryMah: 5000 }, 3),
      offer("d", "telemart", null, 4),
    ]);
    expect(merged).toEqual({ specs: { ramGb: 8, batteryMah: 5000, nfc: true }, from: ["shophive", "mega", "priceoye"] });
  });

  it("breaks a tie with the listing asked about, then with the page read most recently", () => {
    const offers = [offer("a", "priceoye", { ramGb: 8 }, 1), offer("b", "mega", { ramGb: 12 }, 2)];
    expect(mergeSpecSheets(offers).specs).toEqual({ ramGb: 12 });
    expect(mergeSpecSheets(offers, { preferId: "a" }).specs).toEqual({ ramGb: 8 });
  });

  it("is empty when no store page gave specifications", () => {
    expect(mergeSpecSheets([offer("a", "x", null, 1), { _id: "b" }])).toEqual({ specs: null, from: [] });
  });
});

describe("the page check reads specifications", () => {
  const NOW = Date.parse("2026-10-17T12:00:00Z");
  const row = (id, platform, productCategory) => ({ _id: id, platform, title: "Samsung Galaxy A17", productCategory, ptaStatus: "pta_approved", productUrl: `https://${platform}.example/${id}` });
  let updates;
  const model = (rows) => ({
    find: () => ({ sort: () => ({ limit: (n) => ({ lean: async () => rows.slice(0, n) }) }) }),
    updateOne: vi.fn(async (where, change) => { updates.push([where._id, change.$set]); }),
  });
  beforeEach(() => { updates = []; });

  it("stores the sheet for phones, tablets and laptops, counts it, and leaves an earlier sheet alone when a page gives none", async () => {
    expect(SPEC_CATEGORIES).toEqual(["smartphone", "tablet", "laptop"]);
    const readSpecs = vi.fn(async (platform) => (platform === "priceoye" ? { ramGb: 8 } : null));
    const summary = await enrichFromPages({
      model: model([row("1", "priceoye", "smartphone"), row("2", "mega", "laptop"), row("3", "priceoye", "headphones")]),
      fetchPage: async () => "<html></html>", readSpecs, now: NOW, delayMs: 0,
    });
    expect(summary.withSpecs).toBe(1);
    expect(updates.find(([id]) => id === "1")[1].specSheet).toEqual({ ramGb: 8 });
    expect(updates.find(([id]) => id === "2")[1]).not.toHaveProperty("specSheet");
    expect(readSpecs.mock.calls.map(([platform]) => platform)).toEqual(["priceoye", "mega"]); // headphones are not read for specs
  });

  it("saves nothing in a dry run, and uses the real engine door by default (which answers null until it is merged)", async () => {
    const m = model([row("1", "priceoye", "smartphone")]);
    const dry = await enrichFromPages({ model: m, fetchPage: async () => "<html></html>", readSpecs: async () => ({ ramGb: 8 }), now: NOW, delayMs: 0, dry: true });
    expect(dry.results[0].specs).toEqual({ ramGb: 8 });
    expect(m.updateOne).not.toHaveBeenCalled();
    await loadSpecsEngine({ exists: () => false });
    const real = await enrichFromPages({ model: model([row("1", "priceoye", "smartphone")]), fetchPage: async () => "<div class=spec-table>", now: NOW, delayMs: 0 });
    expect(real.withSpecs).toBe(0);
    resetSpecsEngine();
    await install(fakeEngine());
    const withEngine = await enrichFromPages({ model: model([row("1", "priceoye", "smartphone")]), fetchPage: async () => "<div class=spec-table>", now: NOW, delayMs: 0 });
    expect(withEngine.withSpecs).toBe(1);
    expect(updates.at(-1)[1].specSheet).toEqual({ ramGb: 8, batteryMah: 5000 });
  });
});
