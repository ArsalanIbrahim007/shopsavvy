import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/historyEnrichment.service.js", () => ({
  attachPriceHistory: async (listings) => listings.map((l) => ({ ...l, priceHistory: [{ price: l.price, recordedAt: new Date().toISOString() }] })),
}));

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { getCatalog, clearCatalogCache, isCatalogCategory, CATALOG_CATEGORIES } from "../src/services/catalogFeed.service.js";
import { closeGroupingPool, groupingPoolStats } from "../src/services/grouping.service.js";

const NOW = Date.now();
const row = (id, platform, price, title, over = {}) => ({
  _id: `6a78a2af9c96f297ede773${String(id).padStart(2, "0")}`, platform, price, title, normalizedTitle: title.toLowerCase(),
  originalPrice: null, inStock: true, productCategory: "smartphone", ptaStatus: "pta_approved", condition: "new",
  lastScrapedAt: new Date(NOW).toISOString(), ...over,
});

// Three stores sell the A17, two the A57, one the Hot 60i: groups of 3, 2 and 1.
const LISTINGS = [
  row(1, "priceoye", 64000, "Samsung Galaxy A17 8GB 256GB"),
  row(2, "mega", 65500, "Samsung Galaxy A17 8GB 256GB"),
  row(3, "shophive", 66000, "Samsung Galaxy A17 8GB 256GB"),
  row(4, "priceoye", 110000, "Samsung Galaxy A57 8GB 256GB"),
  row(5, "mega", 112000, "Samsung Galaxy A57 8GB 256GB"),
  row(6, "telemart", 38000, "Infinix Hot 60i 8GB 128GB"),
];

let find;
beforeEach(() => {
  clearCatalogCache();
  find = vi.spyOn(Listing, "find").mockImplementation(() => ({ lean: async () => LISTINGS }));
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => closeGroupingPool());

describe("getCatalog", () => {
  it("groups a category and lists the most compared products first, each with its offers", async () => {
    const { groups, total } = await getCatalog({ category: "smartphone" });
    expect(total).toBe(3);
    expect(groups.map((g) => g.offerCount)).toEqual([3, 2, 1]);
    expect(groups[0].productName).toMatch(/Galaxy A17/);
    expect(groups[0].offers.map((o) => o.platform).sort()).toEqual(["mega", "priceoye", "shophive"]);
    expect(groups[0].offers[0].recommendation).toBeTruthy(); // recommendations were attached
    expect(typeof groups[0].offers[0]._id).toBe("string");
  });

  it("always groups in the worker pool, even for a handful of listings, so it never blocks the API", async () => {
    await closeGroupingPool();
    await getCatalog({ category: "smartphone" });
    expect(groupingPoolStats().workers).toBeGreaterThan(0);
  });

  it("leaves each offer's price history out of the cards", async () => {
    const { groups } = await getCatalog({ category: "smartphone" });
    for (const group of groups) for (const offer of group.offers) expect(offer).not.toHaveProperty("priceHistory");
  });

  it("breaks a tie on offers by the cheaper product", async () => {
    find.mockImplementation(() => ({
      lean: async () => [
        row(1, "priceoye", 90000, "Samsung Galaxy A57 8GB 256GB"), row(2, "mega", 91000, "Samsung Galaxy A57 8GB 256GB"),
        row(3, "priceoye", 64000, "Samsung Galaxy A17 8GB 256GB"), row(4, "mega", 65000, "Samsung Galaxy A17 8GB 256GB"),
      ],
    }));
    const { groups } = await getCatalog({ category: "smartphone" });
    expect(groups.map((g) => g.productName)).toEqual([expect.stringMatching(/A17/), expect.stringMatching(/A57/)]);
  });

  it("pages through the result and reports the total", async () => {
    const first = await getCatalog({ category: "smartphone", limit: 2, offset: 0 });
    const second = await getCatalog({ category: "smartphone", limit: 2, offset: 2 });
    expect(first.groups).toHaveLength(2);
    expect(second.groups).toHaveLength(1);
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    expect((await getCatalog({ category: "smartphone", offset: 10 })).groups).toEqual([]);
  });

  it("computes once, then answers from the cache, and shares one computation between simultaneous requests", async () => {
    await Promise.all([getCatalog({ category: "smartphone" }), getCatalog({ category: "smartphone" }), getCatalog({ category: "smartphone" })]);
    expect(find).toHaveBeenCalledTimes(1);
    await getCatalog({ category: "smartphone", limit: 1 });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the cache expires", async () => {
    const t = Date.now();
    await getCatalog({ category: "smartphone", now: t });
    await getCatalog({ category: "smartphone", now: t + 11 * 60 * 1000 });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("asks the database only for visible listings of that category with a real price", async () => {
    await getCatalog({ category: "tv" });
    const filter = find.mock.calls[0][0];
    expect(filter.productCategory).toBe("tv");
    expect(filter.price).toEqual({ $gt: 0 });
    expect(filter.platform.$nin).toContain("daraz");
  });

  it("knows the categories the site is about", () => {
    expect(CATALOG_CATEGORIES).toEqual(expect.arrayContaining(["smartphone", "laptop", "tv"]));
    expect(isCatalogCategory("smartphone")).toBe(true);
    for (const bad of ["accessory", "other", "", undefined, "smartphone,tv", "__proto__"]) expect(isCatalogCategory(bad), String(bad)).toBe(false);
  });
});

describe("GET /api/listings/catalog", () => {
  let server;
  let url;
  beforeAll(async () => {
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const get = (path) => fetch(`${url}/api/listings/catalog${path}`).then(async (res) => ({ res, body: await res.json() }));

  it("returns a page of products with the total, and lets it be cached briefly", async () => {
    const { res, body } = await get("?category=smartphone&limit=2");
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, category: "smartphone", count: 2, total: 3, offset: 0, limit: 2 });
    expect(body.data[0].offerCount).toBe(3);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(typeof body.generatedAt).toBe("string");
  });

  it("rejects a missing or unknown category with a 400 that names the choices, before touching data", async () => {
    for (const path of ["", "?category=", "?category=accessory", "?category=toaster", "?category[]=tv"]) {
      const { res, body } = await get(path);
      expect(res.status, path).toBe(400);
      expect(body.code, path).toBe("BAD_REQUEST");
      expect(body.message, path).toMatch(/smartphone/);
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("clamps limit to 1-50 and treats a bad offset as 0", async () => {
    expect((await get("?category=smartphone&limit=9999")).body.limit).toBe(50);
    expect((await get("?category=smartphone&limit=0")).body.limit).toBe(24); // 0 is not a positive number: the default applies
    const bad = await get("?category=smartphone&offset=-5");
    expect(bad.body.offset).toBe(0);
    expect((await get("?category=smartphone&offset=abc")).body.offset).toBe(0);
    expect((await get("?category=smartphone&offset=1&limit=1")).body.data[0].offerCount).toBe(2);
  });
});
