// GET /api/listings/compare (R4, for Muzammil's Compare page) through the real application, with the database, history and the
// category catalog replaced by controlled data, and the Specs engine absent or replaced by a fake that follows its contract.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/scraper.service.js", () => ({
  fetchAndRefreshListings: vi.fn(async () => ({ scraped: false, reason: "fresh_data" })),
}));
vi.mock("../src/services/historyEnrichment.service.js", () => ({
  attachPriceHistory: vi.fn(async (listings) => listings.map((l) => ({ ...(l.toObject ? l.toObject() : l), priceHistory: [] }))),
}));
vi.mock("../src/services/catalogFeed.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getCatalogGroups: vi.fn(),
}));

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { getCatalogGroups } from "../src/services/catalogFeed.service.js";
import { clearCompareCache, parseCompareIds, COMPARE_LIMITS } from "../src/services/productCompare.service.js";
import { loadSpecsEngine, resetSpecsEngine } from "../src/services/specsEngine.service.js";
import { normalizeTitle } from "../src/services/normalizeTitle.service.js";

const DAY = 86_400_000;
const NOW = Date.now();
const ID = (n) => `6a78a2af9c96f297ede775${String(n).padStart(2, "0")}`;
const row = (n, platform, title, price, over = {}) => ({
  _id: ID(n), platform, title, normalizedTitle: normalizeTitle(title), price, originalPrice: null, inStock: true, productCategory: "smartphone",
  ptaStatus: "pta_approved", condition: "new", lastScrapedAt: new Date(NOW).toISOString(), sourceUrl: `https://${platform}.example/${n}`,
  productUrl: `https://${platform}.example/${n}`, imageUrl: null, specSheet: null, ...over,
});

const CATALOG = [
  row(1, "priceoye", "Samsung Galaxy A17 8GB 256GB", 62000, { specSheet: { ramGb: 8, batteryMah: 5000 }, imageUrl: "https://img.example/a17.webp" }),
  row(2, "mega", "Samsung Galaxy A17 8GB 256GB PTA Approved", 61000, { specSheet: { ramGb: 8, batteryMah: 5000, nfc: true } }),
  row(3, "shophive", "Samsung Galaxy A17 8GB 256GB", 55000, { lastScrapedAt: new Date(NOW - 20 * DAY).toISOString() }), // out of date
  row(4, "priceoye", "Xiaomi Redmi Note 15 8GB 256GB", 75000, { specSheet: { ramGb: 8, batteryMah: 5800 } }),
  row(5, "mega", "Xiaomi Redmi Note 15 8GB 256GB PTA Approved", 74000),
  row(6, "priceoye", "Infinix Hot 60 8GB 256GB", 40000, { ptaStatus: "unknown" }),
];

function chain(rows) {
  const q = { sort: () => q, skip: () => q, limit: () => q, lean: () => q, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  return q;
}
function fakeFind(filter) {
  let rows = CATALOG.filter((r) => !filter.platform?.$nin?.includes(r.platform));
  if (filter._id?.$in) rows = rows.filter((r) => filter._id.$in.includes(String(r._id)));
  if (filter._id?.$ne) rows = rows.filter((r) => String(r._id) !== String(filter._id.$ne));
  if (filter.productCategory) rows = rows.filter((r) => r.productCategory === filter.productCategory);
  return chain(rows.map((r) => ({ ...r })));
}

// Products elsewhere in the catalog, for the rank (the A17's own group is in it too and must not be counted against itself).
const catalogGroups = () => ({
  generatedAt: "t1",
  groups: [
    { lowestPrice: 61000, bestDeal: { _id: ID(2) }, offers: [{ _id: ID(1), specSheet: { ramGb: 8, batteryMah: 5000 } }, { _id: ID(2), specSheet: { ramGb: 8, batteryMah: 5000 } }] },
    { lowestPrice: 65000, bestDeal: { _id: ID(90) }, offers: [{ _id: ID(90), platform: "x", specSheet: { ramGb: 12, batteryMah: 5000 } }] }, // scores 98
    { lowestPrice: 66000, bestDeal: { _id: ID(91) }, offers: [{ _id: ID(91), platform: "x", specSheet: { ramGb: 4, batteryMah: 4000 } }] },
    { lowestPrice: 64000, bestDeal: { _id: ID(92) }, offers: [{ _id: ID(92), platform: "x", specSheet: null }] }, // unscored: left out
  ],
});

const fakeEngine = {
  extractSpecs: () => null,
  normalizeSpecs: (raw) => raw,
  specScore: (sheet) => (sheet && Object.keys(sheet).length >= 2
    ? { score: Math.round(sheet.ramGb * 4 + sheet.batteryMah / 100), parts: [{ field: "ramGb", points: sheet.ramGb * 4, max: 64 }, { field: "batteryMah", points: sheet.batteryMah / 100, max: 70 }] }
    : null),
  rankInBand: (product, others) => ({ rank: 1 + others.filter((o) => o.score > product.score).length, of: others.length + 1, ids: others.map((o) => o.id), category: product.category }),
};

let server;
let base;
const get = (ids) => fetch(`${base}/api/listings/compare${ids === undefined ? "" : `?ids=${ids}`}`).then(async (res) => ({ res, body: await res.json() }));

beforeAll(async () => {
  await new Promise((resolve) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(async () => {
  resetSpecsEngine();
  clearCompareCache();
  await loadSpecsEngine({ exists: () => false });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(Listing, "find").mockImplementation(fakeFind);
  getCatalogGroups.mockReset();
  getCatalogGroups.mockImplementation(async () => catalogGroups());
});
afterEach(() => { vi.restoreAllMocks(); resetSpecsEngine(); });

describe("parseCompareIds", () => {
  it(`accepts ${COMPARE_LIMITS.min} to ${COMPARE_LIMITS.max} distinct listing ids`, () => {
    expect(parseCompareIds(`${ID(1)}, ${ID(4)}`)).toEqual({ ids: [ID(1), ID(4)] });
    expect(parseCompareIds([ID(1), ID(4), ID(5), ID(6)].join(",")).ids).toHaveLength(4);
  });

  it("refuses too few, too many, a malformed id and the same id twice", () => {
    for (const value of [undefined, "", ID(1), [1, 2, 3, 4, 5].map(ID).join(","), `${ID(1)},nope`, `${ID(1)},${ID(1).toUpperCase()}`, `${ID(1)},{"$ne":1}`]) {
      expect(parseCompareIds(value).errors).toHaveLength(1);
    }
  });
});

describe("GET /api/listings/compare", () => {
  it("gives each product's column in the order asked: name, best offer, prices, stores, PTA, and links", async () => {
    const { res, body } = await get(`${ID(4)},${ID(1)}`);
    expect(res.status).toBe(200);
    expect(body.products.map((p) => p.id)).toEqual([ID(4), ID(1)]);
    const a17 = body.products[1];
    expect(a17).toMatchObject({ category: "smartphone", ptaStatus: "pta_approved", image: "https://img.example/a17.webp" });
    expect(a17.productUrl).toMatch(new RegExp(`^http://localhost:5173/product/[a-z0-9-]*galaxy-a17[a-z0-9-]*-${ID(1)}$`));
    expect(a17.name).toMatch(/Galaxy A17/);
    expect(a17.offerCount).toBe(3);
    expect(a17.stores).toBe(3);
    expect(a17.lowestPrice).toBe(61000); // the out-of-date Rs 55,000 offer is not relied on
    expect(a17.bestOffer).toMatchObject({ platform: "mega", price: 61000, outOfDate: false });
  });

  it("without the Specs engine: the sheets the page check stored, and no score or rank", async () => {
    const { body } = await get(`${ID(1)},${ID(6)}`);
    expect(body.specsEngine).toBe("missing");
    expect(body.products[0]).toMatchObject({ specs: { ramGb: 8, batteryMah: 5000, nfc: true }, specScore: null, rank: null });
    expect(body.products[0].specsFrom.sort()).toEqual(["mega", "priceoye"]);
    expect(body.products[1]).toMatchObject({ specs: null, specsFrom: [], specScore: null, rank: null });
    expect(getCatalogGroups).not.toHaveBeenCalled();
  });

  it("with the Specs engine: the score with its parts, and the rank among the OTHER products of the category", async () => {
    resetSpecsEngine();
    await loadSpecsEngine({ exists: () => true, importer: async () => fakeEngine });
    const { body } = await get(`${ID(1)},${ID(6)}`);
    expect(body.specsEngine).toBe("ready");
    const a17 = body.products[0];
    expect(a17.specScore).toEqual({ score: 82, parts: [{ field: "ramGb", points: 32, max: 64 }, { field: "batteryMah", points: 50, max: 70 }] });
    expect(a17.rank).toEqual({ rank: 2, of: 3, ids: [ID(90), ID(91)], category: "smartphone" }); // its own group and the unscored product left out
    expect(body.products[1]).toMatchObject({ specScore: null, rank: null }); // too few specifications: no score, so no rank
  });

  it("ranks against the catalog as it is now: a rebuilt catalog is scored again", async () => {
    resetSpecsEngine();
    await loadSpecsEngine({ exists: () => true, importer: async () => fakeEngine });
    expect((await get(`${ID(1)},${ID(6)}`)).body.products[0].rank).toMatchObject({ rank: 2, of: 3 });
    const rebuilt = catalogGroups();
    rebuilt.generatedAt = "t2";
    rebuilt.groups.push({ lowestPrice: 63000, bestDeal: { _id: ID(93) }, offers: [{ _id: ID(93), platform: "x", specSheet: { ramGb: 12, batteryMah: 4800 } }] });
    getCatalogGroups.mockImplementation(async () => rebuilt);
    expect((await get(`${ID(1)},${ID(6)}`)).body.products[0].rank).toMatchObject({ rank: 3, of: 4 });
  });

  it("refuses a bad request and names the ids it cannot find", async () => {
    for (const ids of [undefined, ID(1), `${ID(1)},${ID(1)}`, `${ID(1)},xyz`]) {
      const { res, body } = await get(ids);
      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    }
    const { res, body } = await get(`${ID(1)},${ID(77)}`);
    expect(res.status).toBe(404);
    expect(body.errors).toEqual({ missing: [ID(77)] });
  });

  it("never scrapes and never writes", async () => {
    const { fetchAndRefreshListings } = await import("../src/services/scraper.service.js");
    const writes = ["create", "updateOne", "updateMany", "findOneAndUpdate", "bulkWrite"].map((m) => vi.spyOn(Listing, m));
    await get(`${ID(1)},${ID(4)}`);
    expect(fetchAndRefreshListings).not.toHaveBeenCalled();
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });
});
