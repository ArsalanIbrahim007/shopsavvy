import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// Search goes through the real app; only the database, scraping and history loading are replaced.
vi.mock("../src/services/scraper.service.js", () => ({ fetchAndRefreshListings: vi.fn(async () => ({ scraped: false, reason: "fresh_data" })) }));
vi.mock("../src/services/historyEnrichment.service.js", () => ({ attachPriceHistory: vi.fn() }));
vi.mock("../src/services/marketMovement.service.js", () => ({ getMarketMovement: vi.fn(async () => null) }));

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { clearCategoryCountsCache } from "../src/controllers/listing.controller.js";
import { attachPriceHistory } from "../src/services/historyEnrichment.service.js";
import { lowestBadge, outlookForOffers, OUTLOOK } from "../src/services/priceOutlook.service.js";

const DAY = 86_400_000;
const NOW = Date.now();
// One record per day, `prices[0]` the oldest, the last one today.
const history = (prices) => prices.map((price, i) => ({ price, recordedAt: new Date(NOW - (prices.length - 1 - i) * DAY) }));
const offer = (platform, prices, over = {}) => ({ platform, price: prices.at(-1), condition: "new", priceHistory: history(prices), ...over });

describe("lowestBadge", () => {
  it("makes the claim when the outlook says the best price is at its lowest, with what it rests on", () => {
    const offers = [offer("priceoye", [100, 104, 102, 101, 103, 99, 95, 90])];
    expect(lowestBadge(offers, { now: NOW })).toMatchObject({ price: 90, low: 90, high: 104, days: 8, records: 8, strength: "early" });
    expect(outlookForOffers(offers, { now: NOW }).verdict).toBe("at_low");
  });

  it("counts the days the records span apart from the number of records (days without a check count as days)", () => {
    const gappy = [100, 104, 102, 101, 103, 99, 95, 90].map((price, i) => ({ price, recordedAt: new Date(NOW - [11, 10, 9, 7, 5, 3, 1, 0][i] * DAY) }));
    expect(lowestBadge([{ platform: "mega", price: 90, condition: "new", priceHistory: gappy }], { now: NOW })).toMatchObject({ days: 12, records: 8 });
  });

  it("counts a price within 1% of the lowest as at the lowest, as the outlook does, and shows today's price, not the low", () => {
    expect(lowestBadge([offer("mega", [100, 104, 102, 101, 103, 99, 95, 90, 90.9])], { now: NOW })).toMatchObject({ price: 90.9, low: 90 });
    expect(lowestBadge([offer("mega", [100, 104, 102, 101, 103, 99, 95, 90, 91])], { now: NOW })).toBeNull();
  });

  it("makes no claim on a price that never moved: always the same is not a low", () => {
    expect(outlookForOffers([offer("mega", [100, 100, 100, 100, 100, 100, 100, 100])], { now: NOW }).verdict).toBe("flat");
    expect(lowestBadge([offer("mega", [100, 100, 100, 100, 100, 100, 100, 100])], { now: NOW })).toBeNull();
  });

  it("makes no claim with too few days of records, or when the newest record is old", () => {
    expect(lowestBadge([offer("mega", [100, 99, 98, 97, 90])], { now: NOW })).toBeNull(); // 5 days, under MIN_DAYS
    expect(OUTLOOK.MIN_DAYS).toBe(7);
    const old = history([100, 104, 102, 101, 103, 99, 95, 90]).map((entry) => ({ ...entry, recordedAt: new Date(entry.recordedAt.getTime() - 5 * DAY) }));
    expect(lowestBadge([{ platform: "mega", price: 90, condition: "new", priceHistory: old }], { now: NOW })).toBeNull(); // stale
  });

  it("makes no claim when the best price is above its usual or merely usual", () => {
    expect(lowestBadge([offer("mega", [90, 92, 91, 93, 90, 92, 91, 110])], { now: NOW })).toBeNull();
    expect(lowestBadge([offer("mega", [90, 100, 95, 100, 92, 100, 96, 95])], { now: NOW })).toBeNull();
  });

  it("gives nothing for no offers or offers without history", () => {
    expect(lowestBadge([], { now: NOW })).toBeNull();
    expect(lowestBadge([{ platform: "mega", price: 90 }], { now: NOW })).toBeNull();
  });
});

describe("GET /api/listings/search carries the claim on each product group", () => {
  let server;
  let url;
  beforeAll(async () => { await new Promise((resolve) => { server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); }); }); });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  const row = (n, platform, price, title) => ({
    _id: `6a78a2af9c96f297ede773${String(n).padStart(2, "0")}`, platform, title, normalizedTitle: title.toLowerCase(), price, originalPrice: null,
    currency: "PKR", inStock: true, productCategory: "smartphone", ptaStatus: "pta_approved", condition: "new", lastScrapedAt: new Date().toISOString(),
  });
  const chain = (rows) => { const q = { sort: () => q, skip: () => q, limit: () => q, lean: () => q, then: (ok, ko) => Promise.resolve(rows).then(ok, ko) }; return q; };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    clearCategoryCountsCache();
    vi.spyOn(Listing, "aggregate").mockResolvedValue([]);
    vi.spyOn(Listing, "find").mockImplementation(() => chain([
      row(1, "priceoye", 90, "Samsung Galaxy A17 8GB 256GB"), row(2, "mega", 92, "Samsung Galaxy A17 8GB 256GB"),
      row(3, "shophive", 300, "Samsung Galaxy S26 Ultra 12GB 512GB"),
    ]));
    vi.mocked(attachPriceHistory).mockImplementation(async (listings) => listings.map((l) => ({
      ...l,
      priceHistory: l.title.includes("A17") ? history(l.platform === "priceoye" ? [100, 104, 102, 101, 103, 99, 95, 90] : [101, 103, 103, 102, 104, 100, 96, 92]) : history([300, 300]),
    })));
  });
  afterEach(() => vi.restoreAllMocks());

  it("marks the group whose best price is at its recorded low, and not the one with too little history", async () => {
    const res = await fetch(`${url}/api/listings/search?q=samsung%20galaxy`);
    const body = await res.json();
    expect(res.status).toBe(200);
    const a17 = body.groups.find((g) => /A17/.test(g.productName));
    const s26 = body.groups.find((g) => /S26/.test(g.productName));
    expect(a17.atLow).toMatchObject({ price: 90, low: 90, days: 8, records: 8 });
    expect(s26.atLow).toBeNull();
  });
});
