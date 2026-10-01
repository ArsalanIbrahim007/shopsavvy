// Endpoint behaviour through the REAL application (createApp: real middleware,
// routes, validators, controllers, services and error handler) with the database
// and the outbound scrapers replaced by controlled data. api.integration.test.js
// covers the failure paths with no database at all; this file covers what a caller
// gets when the data layer works: search, product detail, listings, alerts,
// injection attempts, and an unexpected failure.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/scraper.service.js", () => ({
  fetchAndRefreshListings: vi.fn(async () => ({ scraped: false, reason: "fresh_data" })),
}));
vi.mock("../src/services/historyEnrichment.service.js", () => ({
  attachPriceHistory: vi.fn(async (listings) => listings.map((l) => ({ ...l, priceHistory: [] }))),
}));
vi.mock("../src/services/marketMovement.service.js", () => ({
  getMarketMovement: vi.fn(async () => null),
}));
vi.mock("../src/services/priceHistory.service.js", () => ({
  recordPriceSnapshot: vi.fn(async () => ({ created: true, reason: "recorded", snapshot: {} })),
  getListingPriceHistory: vi.fn(async () => ({ summary: { points: 0 }, history: [] })),
}));

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { clearCategoryCountsCache } from "../src/controllers/listing.controller.js";
import { fetchAndRefreshListings } from "../src/services/scraper.service.js";
import { attachPriceHistory } from "../src/services/historyEnrichment.service.js";
import { getMarketMovement } from "../src/services/marketMovement.service.js";
import { recordPriceSnapshot } from "../src/services/priceHistory.service.js";

const ID = (n) => `6a78a2af9c96f297ede773${String(n).padStart(2, "0")}`;
const NOW = new Date().toISOString();

const row = (n, platform, price, title = "Samsung Galaxy A17 8GB 256GB", over = {}) => ({
  _id: ID(n), platform, title, normalizedTitle: title.toLowerCase(), price, originalPrice: null, currency: "PKR",
  inStock: true, productCategory: "smartphone", ptaStatus: "pta_approved", condition: "new", lastScrapedAt: NOW, ...over,
});

// The Mongoose query chain (find().sort().skip().limit()) as a thenable holding `rows`.
function chain(rows) {
  const q = {
    sort: () => q, skip: vi.fn(() => q), limit: vi.fn(() => q), lean: () => q,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

let server;
let url;
let extendedServer;
let extendedUrl;
const originalKey = process.env.ADMIN_API_KEY;

const json = (path, init) => fetch(`${url}${path}`, init).then(async (res) => ({ res, body: await res.json() }));
// Express 5 parses `?colour[$ne]=x` as a plain key by default, so an operator cannot arrive as an object.
// These requests go to an app configured with the "extended" parser (what a later config change
// would produce) to prove the guards in queryParams.service.js still hold on their own.
const jsonExtended = (path, init) => fetch(`${extendedUrl}${path}`, init).then(async (res) => ({ res, body: await res.json() }));
const send = (method, path, body, headers = {}) =>
  json(path, { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
  await new Promise((resolve) => {
    const app = createApp();
    app.set("query parser", "extended");
    extendedServer = app.listen(0, () => { extendedUrl = `http://127.0.0.1:${extendedServer.address().port}`; resolve(); });
  });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => extendedServer.close(resolve));
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  clearCategoryCountsCache();
  vi.spyOn(Listing, "aggregate").mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(fetchAndRefreshListings).mockClear();
  vi.mocked(recordPriceSnapshot).mockClear();
  if (originalKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = originalKey;
});

describe("GET /api/listings/search", () => {
  const threeStores = [
    row(1, "priceoye", 60000), row(2, "mega", 61500), row(3, "shophive", 63000),
  ];

  it("groups the same product across stores and summarises it", async () => {
    vi.spyOn(Listing, "find").mockImplementation(() => chain(threeStores));

    const { res, body } = await json("/api/listings/search?q=galaxy%20a17");
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, query: "galaxy a17", count: 3, groupCount: 1 });
    expect(body.groups[0]).toMatchObject({ offerCount: 3 });
    expect(body.summary).toMatchObject({ platforms: 3, lowestPrice: 60000, highestPrice: 63000 });
    expect(body.data).toHaveLength(3);
    expect(body.data.every((offer) => offer.recommendation)).toBe(true);
  });

  it("answers no results with an empty, well-formed 200", async () => {
    vi.spyOn(Listing, "find").mockImplementation(() => chain([]));

    const { res, body } = await json("/api/listings/search?q=nothingmatchesthis");
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, count: 0, groupCount: 0, groups: [], data: [] });
    expect(body.summary).toMatchObject({ lowestPrice: null, platforms: 0 });
  });

  it("keeps working for a large result set that is grouped in a worker thread", async () => {
    const many = Array.from({ length: 60 }, (_, i) => row(i + 10, "priceoye", 50000 + i, `Samsung Galaxy A${10 + i} 5G Smartphone 8GB 256GB Black`));
    vi.spyOn(Listing, "find").mockImplementation(() => chain(many));

    const { res, body } = await json("/api/listings/search?q=samsung");
    expect(res.status).toBe(200);
    expect(body.count).toBe(60);
    expect(body.groups.reduce((sum, g) => sum + g.offerCount, 0)).toBe(60);
    expect(body.groups[0].offers[0]._id).toEqual(expect.stringMatching(/^[0-9a-f]{24}$/));
  });

  it("supports the rule-based matcher through ?matching=rule", async () => {
    vi.spyOn(Listing, "find").mockImplementation(() => chain(threeStores));
    const { res, body } = await json("/api/listings/search?q=galaxy%20a17&matching=rule");
    expect(res.status).toBe(200);
    expect(body.groupCount).toBeGreaterThanOrEqual(1);
  });

  it("escapes regex characters in the query instead of failing or matching too much", async () => {
    const find = vi.spyOn(Listing, "find").mockImplementation(() => chain([]));

    const { res } = await json(`/api/listings/search?q=${encodeURIComponent("iPhone (17) [Pro]+")}`);
    expect(res.status).toBe(200);

    const pattern = find.mock.calls[0][0].$or[0].title.$regex;
    const regex = new RegExp(pattern, "i");
    expect(regex.test("Apple iPhone (17) [Pro]+ 256GB")).toBe(true);
    expect(regex.test("iPhone 17 Pro")).toBe(false); // the brackets are literal characters, not a group
  });

  it("ignores query-string operators instead of passing them to the database", async () => {
    const find = vi.spyOn(Listing, "find").mockImplementation(() => chain([]));

    const q = "q=iphone&colour[$ne]=x&storage[$gt]=0&pta[$regex]=.*&condition[$exists]=true&category[$ne]=x";
    const { res } = await jsonExtended(`/api/listings/search?${q}`);
    expect(res.status).toBe(200);

    const filter = find.mock.calls[0][0];
    expect(filter.colour).toBeUndefined();
    expect(filter.storageGb).toBeUndefined();
    expect(filter.ptaStatus).toBeUndefined();
    expect(filter.condition).toBeUndefined();
    expect(["string", "undefined"]).toContain(typeof filter.productCategory);
    // Every filter value is a plain value or the intended $or / $nin structures.
    expect(JSON.stringify(filter)).not.toMatch(/"\$(ne|gt|exists)"/);
  });

  it("applies explicit category and attribute filters", async () => {
    const find = vi.spyOn(Listing, "find").mockImplementation(() => chain([]));
    await json("/api/listings/search?q=galaxy&category=smartphone&storage=256&colour=Black&condition=new&pta=pta_approved");
    const filter = find.mock.calls[0][0];
    expect(filter).toMatchObject({ productCategory: "smartphone", storageGb: 256, colour: "Black", condition: "new", ptaStatus: "pta_approved" });
  });

  it("does not let an ordinary caller force a re-scrape, but lets the admin key do it", async () => {
    vi.spyOn(Listing, "find").mockImplementation(() => chain([]));
    process.env.ADMIN_API_KEY = "test-key-123";

    await json("/api/listings/search?q=galaxy&refresh=true");
    expect(fetchAndRefreshListings.mock.calls.at(-1)[1].force).toBe(false);

    await json("/api/listings/search?q=galaxy&refresh=true", { headers: { "x-admin-key": "wrong" } });
    expect(fetchAndRefreshListings.mock.calls.at(-1)[1].force).toBe(false);

    await json("/api/listings/search?q=galaxy&refresh=true", { headers: { "x-admin-key": "test-key-123" } });
    expect(fetchAndRefreshListings.mock.calls.at(-1)[1].force).toBe(true);
  });
});

describe("GET /api/listings/:id", () => {
  const selected = row(1, "priceoye", 60000);

  it("answers 404 NOT_FOUND for a well-formed id that does not exist", async () => {
    vi.spyOn(Listing, "findOne").mockResolvedValue(null);
    const { res, body } = await json(`/api/listings/${ID(99)}`);
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: "NOT_FOUND", message: "Listing not found" });
  });

  it("returns the listing with the same product's offers from other stores, and nothing unrelated", async () => {
    vi.spyOn(Listing, "findOne").mockResolvedValue(selected);
    vi.spyOn(Listing, "find").mockImplementation(() => chain([
      row(2, "mega", 61500),
      row(3, "shophive", 63000),
      row(4, "telemart", 250000, "Apple MacBook Pro 14 M4 16GB 512GB", { productCategory: "smartphone" }),
    ]));

    const { res, body } = await json(`/api/listings/${ID(1)}`);
    expect(res.status).toBe(200);
    expect(body.listing._id).toBe(ID(1));
    expect(body.offers.map((offer) => offer.platform).sort()).toEqual(["mega", "priceoye", "shophive"]);
    expect(body.productGroup.offerCount).toBe(3);
    expect(body.summary).toMatchObject({ platforms: 3, lowestPrice: 60000, highestPrice: 63000 });
  });

  describe("the wait-or-buy outlook", () => {
    // ten consecutive days of records ending today, one per day, at the given prices
    const history = (prices) => prices.map((price, i) => ({ price, recordedAt: new Date(Date.now() - (prices.length - 1 - i) * 86400000).toISOString() }));
    const withHistory = (byPrice) => attachPriceHistory.mockImplementationOnce(async (listings) => listings.map((l) => ({ ...l, priceHistory: byPrice(l) })));

    it("says it is too early when a product has only a few records", async () => {
      vi.spyOn(Listing, "findOne").mockResolvedValue(selected);
      vi.spyOn(Listing, "find").mockImplementation(() => chain([row(2, "mega", 61500)]));
      const { res, body } = await json(`/api/listings/${ID(1)}`);
      expect(res.status).toBe(200);
      expect(body.outlook).toMatchObject({ verdict: "too_early", why: "no_records", stats: null, strength: null, market: null });
    });

    it("works the outlook out from the product's recorded prices, and adds how prices move across the catalog", async () => {
      vi.spyOn(Listing, "findOne").mockResolvedValue(selected);
      vi.spyOn(Listing, "find").mockImplementation(() => chain([row(2, "mega", 61500)]));
      withHistory(() => history([66000, 65000, 64000, 63000, 62000, 61000, 60500, 60200, 60100, 60000]));
      vi.mocked(getMarketMovement).mockResolvedValueOnce({ comparisons: 221, fell: 42, rose: 25 });
      const { body } = await json(`/api/listings/${ID(1)}`);
      expect(body.outlook).toMatchObject({ verdict: "at_low", strength: "early", basis: { days: 10, records: 10 }, stats: { current: 60000, low: 60000, high: 66000 } });
      expect(body.outlook.market).toEqual({ comparisons: 221, fell: 42, rose: 25 });
    });

    it("still serves the product, with outlook null, when the outlook cannot be worked out", async () => {
      vi.spyOn(Listing, "findOne").mockResolvedValue(selected);
      vi.spyOn(Listing, "find").mockImplementation(() => chain([row(2, "mega", 61500)]));
      vi.mocked(getMarketMovement).mockRejectedValueOnce(new Error("boom"));
      const { res, body } = await json(`/api/listings/${ID(1)}`);
      expect(res.status).toBe(200);
      expect(body.outlook).toBeNull();
      expect(body.offers.length).toBeGreaterThan(0);
    });
  });

  it("still answers when the product is sold by only one store", async () => {
    vi.spyOn(Listing, "findOne").mockResolvedValue(selected);
    vi.spyOn(Listing, "find").mockImplementation(() => chain([]));

    const { res, body } = await json(`/api/listings/${ID(1)}`);
    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.summary.platforms).toBe(1);
    expect(body.listing.recommendation).toBeTruthy();
  });

  it("answers the price history of an unknown listing with 404 and of a bad id with 400", async () => {
    vi.spyOn(Listing, "findById").mockReturnValue({ lean: async () => null });
    const missing = await json(`/api/listings/${ID(99)}/history`);
    expect(missing.res.status).toBe(404);
    expect(missing.body.code).toBe("NOT_FOUND");

    const invalid = await json("/api/listings/xyz/history");
    expect(invalid.res.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_ID");
  });
});

describe("listing list and stats", () => {
  it("reports the headline numbers from counts, not by loading every listing", async () => {
    vi.spyOn(Listing, "countDocuments").mockResolvedValue(3203);
    vi.spyOn(Listing, "distinct").mockResolvedValue(["priceoye", "mega", "shophive", "telemart", "ishopping", "paklap", "w11stop"]);
    Listing.aggregate.mockResolvedValue([{ _id: "smartphone", count: 1368 }, { _id: "tv", count: 571 }, { _id: "other", count: 217 }]);

    const { res, body } = await json("/api/listings/stats");
    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      products: 3203,
      platforms: 7,
      categories: [{ category: "smartphone", count: 1368 }, { category: "tv", count: 571 }, { category: "other", count: 217 }],
    });
  });

  it("counts categories over visible stores only, and answers repeat calls from a short cache", async () => {
    vi.spyOn(Listing, "countDocuments").mockResolvedValue(1);
    vi.spyOn(Listing, "distinct").mockResolvedValue([]);
    Listing.aggregate.mockResolvedValue([{ _id: "tv", count: 5 }]);

    await json("/api/listings/stats");
    await json("/api/listings/stats");
    expect(Listing.aggregate).toHaveBeenCalledTimes(1);

    const pipeline = Listing.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.platform.$nin).toContain("daraz");
    // A listing with no category is counted as "other" rather than dropped or shown as null.
    expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$productCategory","other"]');
  });

  it("paginates only when asked, and clamps the page size", async () => {
    const q = chain([row(1, "priceoye", 60000)]);
    vi.spyOn(Listing, "find").mockReturnValue(q);
    vi.spyOn(Listing, "countDocuments").mockResolvedValue(45);

    const paged = await json("/api/listings?limit=5&page=3");
    expect(q.skip).toHaveBeenCalledWith(10);
    expect(q.limit).toHaveBeenCalledWith(5);
    expect(paged.body).toMatchObject({ total: 45, page: 3, limit: 5, totalPages: 9 });

    q.skip.mockClear();
    q.limit.mockClear();
    await json("/api/listings?limit=999999");
    expect(q.limit).toHaveBeenCalledWith(200);

    q.skip.mockClear();
    q.limit.mockClear();
    const unpaged = await json("/api/listings");
    expect(q.limit).not.toHaveBeenCalled();
    expect(unpaged.body.total).toBeUndefined();
  });
});

describe("POST /api/listings (admin only)", () => {
  const good = { platform: "priceoye", title: "Samsung Galaxy A17 256GB", price: 60000 };

  it("stores only the fields a caller may set, ignoring everything else", async () => {
    process.env.ADMIN_API_KEY = "test-key-123";
    const create = vi.spyOn(Listing, "create").mockImplementation(async (data) => ({ _id: ID(1), ...data }));

    const { res, body } = await send("POST", "/api/listings", {
      ...good, productCategory: "laptop", lastScrapedAt: "2020-01-01", isVerified: true, _id: ID(50), priceHistory: [1],
    }, { "x-admin-key": "test-key-123" });

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const stored = create.mock.calls[0][0];
    expect(stored).toMatchObject(good);
    for (const field of ["productCategory", "lastScrapedAt", "isVerified", "_id", "priceHistory"]) {
      expect(stored, field).not.toHaveProperty(field);
    }
    expect(recordPriceSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid listing with the field errors and stores nothing", async () => {
    process.env.ADMIN_API_KEY = "test-key-123";
    const create = vi.spyOn(Listing, "create");

    const { res, body } = await send("POST", "/api/listings", { platform: "", title: "x", price: 0 }, { "x-admin-key": "test-key-123" });
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.errors.map((e) => e.path).sort()).toEqual(["platform", "price", "title"]);
    expect(create).not.toHaveBeenCalled();
  });
});

// The alert endpoints (double opt-in, confirm/cancel links) are covered in api.alerts.test.js.

describe("responses in general", () => {
  it("reuses a harmless x-request-id and replaces a harmful one", async () => {
    vi.spyOn(Listing, "countDocuments").mockResolvedValue(1);
    vi.spyOn(Listing, "distinct").mockResolvedValue([]);

    const ok = await fetch(`${url}/api/listings/stats`, { headers: { "x-request-id": "trace-abc_123" } });
    expect(ok.headers.get("x-request-id")).toBe("trace-abc_123");

    const bad = await fetch(`${url}/api/listings/stats`, { headers: { "x-request-id": "bad id\twith spaces;" } });
    expect(bad.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.headers.get("x-powered-by")).toBeNull();
  });

  it("logs the path of a request but never its query string (search text and email addresses)", async () => {
    const log = console.log;
    await json("/api/no-such-route?email=private.person@example.com&token=secret-token-value");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const lines = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(lines).toMatch(/GET \/api\/no-such-route 404/);
    expect(lines).not.toMatch(/secret-token-value/);
    expect(lines).not.toMatch(/private\.person|email=/);
  });

  it("turns an unexpected failure into a generic 500 that leaks no internals", async () => {
    vi.spyOn(Listing, "countDocuments").mockRejectedValue(new Error("secret: mongodb://admin:hunter2@10.0.0.5/shopsavvy exploded"));
    vi.spyOn(Listing, "distinct").mockResolvedValue([]);

    const { res, body } = await json("/api/listings/stats");
    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: "INTERNAL_ERROR" });
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
    expect(JSON.stringify(body)).not.toMatch(/secret|hunter2|mongodb:\/\//);
  });
});
