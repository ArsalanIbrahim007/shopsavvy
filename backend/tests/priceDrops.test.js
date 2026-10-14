import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

import Listing from "../src/models/listing.model.js";
import PriceHistory from "../src/models/priceHistory.model.js";
import { createApp } from "../src/createApp.js";
import { DEAL_CATEGORIES } from "../src/services/dealsFeed.service.js";
import { clearPriceDropsCache, computePriceDrops, DROPS, findDrop, getPriceDrops } from "../src/services/priceDrops.service.js";

// 2026-10-15 12:00 in Pakistan (UTC+5).
const NOW = Date.parse("2026-10-15T07:00:00Z");
const DAY = 86_400_000;
const at = (daysAgo, hour = 22) => new Date(Date.parse(`2026-10-${String(15 - daysAgo).padStart(2, "0")}T${String(hour - 5).padStart(2, "0")}:00:00Z`));
const entry = (daysAgo, price, hour) => ({ price, recordedAt: at(daysAgo, hour) });

describe("findDrop", () => {
  it("finds a drop between the newest price and the price on the previous day it was checked", () => {
    expect(findDrop([entry(5, 210000), entry(4, 204999), entry(1, 156999)], { now: NOW })).toEqual({
      price: 156999, before: 204999, day: "2026-10-14", beforeDay: "2026-10-11", rupees: 48000, percent: 23.4,
    });
  });

  it("uses the last price recorded on a day, and ignores the order the entries come in", () => {
    const entries = [entry(1, 90000, 23), entry(2, 100000, 10), entry(1, 95000, 20), entry(2, 101000, 21)];
    expect(findDrop(entries, { now: NOW })).toMatchObject({ before: 101000, price: 90000 });
  });

  it("needs at least 5% AND at least PKR 500: both edges included, one step under each left out", () => {
    expect(findDrop([entry(2, 20000), entry(1, 19000)], { now: NOW })).toMatchObject({ percent: 5, rupees: 1000 }); // exactly 5%
    expect(findDrop([entry(2, 20000), entry(1, 19001)], { now: NOW })).toBeNull(); // 4.995%
    expect(findDrop([entry(2, 10000), entry(1, 9500)], { now: NOW })).toMatchObject({ rupees: 500 }); // exactly PKR 500 (and 5%)
    expect(findDrop([entry(2, 9000), entry(1, 8501)], { now: NOW })).toBeNull(); // 5.5% but only PKR 499
  });

  it("leaves out a fall of more than 50%, which is more often a listing error than a sale", () => {
    expect(findDrop([entry(2, 100000), entry(1, 50000)], { now: NOW })).toMatchObject({ percent: 50 });
    expect(findDrop([entry(2, 100000), entry(1, 49999)], { now: NOW })).toBeNull();
  });

  it("is not a drop when the price rose, stayed the same, or there is only one day", () => {
    expect(findDrop([entry(2, 100000), entry(1, 110000)], { now: NOW })).toBeNull();
    expect(findDrop([entry(2, 100000), entry(1, 100000)], { now: NOW })).toBeNull();
    expect(findDrop([entry(1, 100000, 10), entry(1, 80000, 20)], { now: NOW })).toBeNull(); // same day: one day of prices
    expect(findDrop([], { now: NOW })).toBeNull();
    expect(findDrop(undefined, { now: NOW })).toBeNull();
  });

  it("only counts a drop seen today or yesterday (Pakistan time)", () => {
    expect(findDrop([entry(3, 100000), entry(0, 80000, 11)], { now: NOW })).not.toBeNull(); // today
    expect(findDrop([entry(3, 100000), entry(1, 80000)], { now: NOW })).not.toBeNull(); // yesterday
    expect(findDrop([entry(4, 100000), entry(2, 80000)], { now: NOW })).toBeNull(); // two days ago: old news
  });

  it("compares with a price at most 14 days before the newest one", () => {
    expect(findDrop([{ price: 100000, recordedAt: new Date(at(1).getTime() - 14 * DAY) }, entry(1, 80000)], { now: NOW })).not.toBeNull();
    expect(findDrop([{ price: 100000, recordedAt: new Date(at(1).getTime() - 15 * DAY) }, entry(1, 80000)], { now: NOW })).toBeNull();
  });

  it("skips entries with no usable price or date", () => {
    const entries = [entry(3, 100000), { price: 0, recordedAt: at(2) }, { price: null, recordedAt: at(2) }, { price: 5, recordedAt: "not a date" }, entry(1, 90000)];
    expect(findDrop(entries, { now: NOW })).toMatchObject({ before: 100000, price: 90000 });
  });

  it("keeps the thresholds it documents", () => {
    expect(DROPS).toEqual({ MIN_PERCENT: 5, MIN_RUPEES: 500, MAX_PERCENT: 50, RECENT_DAYS: 2, BEFORE_MAX_DAYS: 14 });
  });
});

// Fake models: find(filter) -> select() -> lean() -> rows, remembering the filter.
const model = (rows) => {
  const m = { filters: [] };
  m.find = vi.fn((filter) => { m.filters.push(filter); return { select: () => ({ lean: async () => (typeof rows === "function" ? rows(filter) : rows) }) }; });
  return m;
};
const history = (platform, sourceUrl, entries) => ({ platform, sourceUrl, entries });
const listing = (id, platform, sourceUrl, price, over = {}) => ({ _id: id, platform, sourceUrl, price, title: `Product ${id}`, productCategory: "smartwatch", condition: "new", ...over });

describe("computePriceDrops", () => {
  const histories = [
    history("priceoye", "https://p/watch", [entry(4, 204999), entry(1, 156999)]), // 23.4%
    history("priceoye", "https://p/ipad", [entry(2, 149999), entry(1, 139999)]), // 6.7%
    history("mega", "https://m/flat", [entry(2, 50000), entry(1, 50000)]), // no drop
  ];

  it("joins history to listings by store and product URL (almost no history has a listing id), biggest drop first", async () => {
    const listings = model([listing("b", "priceoye", "https://p/ipad", 139999, { productCategory: "tablet" }), listing("a", "priceoye", "https://p/watch", 156999)]);
    const drops = await computePriceDrops({ now: NOW, historyModel: model(histories), listingModel: listings });
    expect(drops.map((d) => [d._id, d.drop.percent])).toEqual([["a", 23.4], ["b", 6.7]]);
    expect(listings.filters[0]).toMatchObject({ sourceUrl: { $in: ["https://p/watch", "https://p/ipad"] }, isActive: true, productCategory: { $in: DEAL_CATEGORIES } });
  });

  it("asks history only for documents with a recent entry, and asks for no listings when nothing dropped", async () => {
    const histories = model([history("mega", "https://m/flat", [entry(2, 50000), entry(1, 50000)])]);
    const listings = model([]);
    expect(await computePriceDrops({ now: NOW, historyModel: histories, listingModel: listings })).toEqual([]);
    expect(histories.filters[0]["entries.recordedAt"].$gte.getTime()).toBe(NOW - (DROPS.RECENT_DAYS + 1) * DAY);
    expect(listings.find).not.toHaveBeenCalled();
  });

  it("matches the store name whatever its case", async () => {
    const drops = await computePriceDrops({ now: NOW, historyModel: model([history("PriceOye", "https://p/watch", [entry(4, 204999), entry(1, 156999)])]), listingModel: model([listing("a", "priceoye", "https://p/watch", 156999)]) });
    expect(drops).toHaveLength(1);
  });

  it("does not mix up two stores that share a URL path", async () => {
    const drops = await computePriceDrops({ now: NOW, historyModel: model([history("mega", "https://p/watch", [entry(4, 204999), entry(1, 156999)])]), listingModel: model([listing("a", "priceoye", "https://p/watch", 156999)]) });
    expect(drops).toEqual([]);
  });

  it("leaves out used, refurbished and open-box offers, and an offer whose price has moved again since", async () => {
    const listings = model([
      listing("u", "priceoye", "https://p/watch", 156999, { condition: "used" }),
      listing("i", "priceoye", "https://p/ipad", 145000, { productCategory: "tablet" }), // repriced after the record
    ]);
    expect(await computePriceDrops({ now: NOW, historyModel: model(histories), listingModel: listings })).toEqual([]);
    for (const condition of ["refurbished", "open_box"]) {
      expect(await computePriceDrops({ now: NOW, historyModel: model(histories), listingModel: model([listing("x", "priceoye", "https://p/watch", 156999, { condition })]) })).toEqual([]);
    }
  });

  it("restricts to one category when asked, and returns at most `limit`, with string ids", async () => {
    const listings = model([listing("a", "priceoye", "https://p/watch", 156999)]);
    const drops = await computePriceDrops({ category: "smartwatch", limit: 1, now: NOW, historyModel: model(histories), listingModel: listings });
    expect(listings.filters[0].productCategory).toEqual({ $in: ["smartwatch"] });
    expect(drops).toHaveLength(1);
    expect(typeof drops[0]._id).toBe("string");
  });

  it("cuts the list to `limit`, keeping the biggest drops", async () => {
    const listings = model([listing("b", "priceoye", "https://p/ipad", 139999, { productCategory: "tablet" }), listing("a", "priceoye", "https://p/watch", 156999)]);
    const drops = await computePriceDrops({ limit: 1, now: NOW, historyModel: model(histories), listingModel: listings });
    expect(drops.map((d) => d._id)).toEqual(["a"]);
  });

  it("orders equal percentages by the bigger saving in rupees", async () => {
    const hs = [history("a", "u1", [entry(2, 10000), entry(1, 9000)]), history("b", "u2", [entry(2, 100000), entry(1, 90000)])];
    const ls = model([listing("small", "a", "u1", 9000), listing("big", "b", "u2", 90000)]);
    expect((await computePriceDrops({ now: NOW, historyModel: model(hs), listingModel: ls })).map((d) => d._id)).toEqual(["big", "small"]);
  });
});

describe("getPriceDrops (cached)", () => {
  const chainOf = (rows) => ({ select: () => ({ lean: async () => rows }) });
  beforeEach(() => {
    clearPriceDropsCache();
    vi.spyOn(PriceHistory, "find").mockImplementation(() => chainOf([history("priceoye", "https://p/watch", [entry(4, 204999), entry(1, 156999)])]));
    vi.spyOn(Listing, "find").mockImplementation(() => chainOf([listing("a", "priceoye", "https://p/watch", 156999)]));
  });
  afterEach(() => { vi.restoreAllMocks(); clearPriceDropsCache(); });

  it("computes once per category for ten minutes, then again", async () => {
    await getPriceDrops({ now: NOW });
    await getPriceDrops({ now: NOW + 9 * 60_000 });
    expect(PriceHistory.find).toHaveBeenCalledTimes(1);
    await getPriceDrops({ now: NOW + 10 * 60_000 });
    expect(PriceHistory.find).toHaveBeenCalledTimes(2);
    await getPriceDrops({ category: "tablet", now: NOW + 10 * 60_000 });
    expect(PriceHistory.find).toHaveBeenCalledTimes(3);
  });

  it("lets requests that arrive together share one computation", async () => {
    const results = await Promise.all([getPriceDrops({ now: NOW }), getPriceDrops({ now: NOW }), getPriceDrops({ now: NOW })]);
    expect(PriceHistory.find).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.drops.length)).toEqual([1, 1, 1]);
  });

  it("does not keep a failure: the next request tries again", async () => {
    vi.mocked(PriceHistory.find).mockImplementationOnce(() => ({ select: () => ({ lean: async () => { throw new Error("db down"); } }) }));
    await expect(getPriceDrops({ now: NOW })).rejects.toThrow("db down");
    expect((await getPriceDrops({ now: NOW })).drops).toHaveLength(1);
  });

  it("cuts the cached list to the limit asked for, and says when it was computed", async () => {
    const result = await getPriceDrops({ limit: 0, now: NOW });
    expect(result).toEqual({ drops: [], generatedAt: new Date(NOW).toISOString() });
  });
});

describe("GET /api/listings/drops", () => {
  let server;
  let url;
  beforeAll(async () => { await new Promise((resolve) => { server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); }); }); });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
  beforeEach(() => {
    clearPriceDropsCache();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(PriceHistory, "find").mockImplementation(() => ({ select: () => ({ lean: async () => [history("priceoye", "https://p/watch", [{ price: 204999, recordedAt: new Date(Date.now() - 3 * DAY) }, { price: 156999, recordedAt: new Date() }])] }) }));
    vi.spyOn(Listing, "find").mockImplementation(() => ({ select: () => ({ lean: async () => [listing("a", "priceoye", "https://p/watch", 156999)] }) }));
  });
  afterEach(() => { vi.restoreAllMocks(); clearPriceDropsCache(); });

  it("answers with the drops, the rules used, and a short cache header", async () => {
    const res = await fetch(`${url}/api/listings/drops`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(body).toMatchObject({ success: true, count: 1, rules: DROPS });
    expect(body.data[0]).toMatchObject({ _id: "a", drop: { before: 204999, price: 156999 } });
  });

  it("refuses an unknown category", async () => {
    const res = await fetch(`${url}/api/listings/drops?category=fridge`);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });

  it("is not mistaken for a listing id", async () => {
    const res = await fetch(`${url}/api/listings/drops?limit=5`);
    expect(res.status).toBe(200);
  });
});
