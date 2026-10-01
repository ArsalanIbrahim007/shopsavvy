import { describe, it, expect } from "vitest";

import { STALE_AFTER_DAYS, currentOffers, isOutOfDate } from "../src/services/offerFreshness.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { extractPtaStatus } from "../src/services/productAttributes.service.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

describe("isOutOfDate", () => {
  it("says an offer is out of date once its price was last checked more than 14 days ago", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(14) }, NOW)).toBe(false); // exactly 14 days: not yet
    expect(isOutOfDate({ lastScrapedAt: new Date(NOW - 14 * DAY - 1000).toISOString() }, NOW)).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(51) }, NOW)).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(0) }, NOW)).toBe(false);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(13) }, NOW)).toBe(false);
  });

  it("does not call an offer out of date when it has no usable check date: not knowing is not the same as knowing it is old", () => {
    for (const value of [{}, { lastScrapedAt: null }, { lastScrapedAt: undefined }, { lastScrapedAt: "not a date" }, { lastScrapedAt: 0 }, null, undefined]) {
      expect(isOutOfDate(value, NOW)).toBe(false);
    }
  });

  it("takes a Date or a timestamp as well as an ISO string", () => {
    expect(isOutOfDate({ lastScrapedAt: new Date(NOW - 30 * DAY) }, NOW)).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: NOW - 30 * DAY }, NOW)).toBe(true);
  });

  it("uses the current time when none is given", () => {
    expect(isOutOfDate({ lastScrapedAt: new Date(Date.now() - 20 * DAY).toISOString() })).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: new Date().toISOString() })).toBe(false);
  });
});

describe("currentOffers", () => {
  const fresh = { id: "fresh", lastScrapedAt: daysAgo(1) };
  const old = { id: "old", lastScrapedAt: daysAgo(40) };
  const undated = { id: "undated" };

  it("keeps the current offers and drops the old ones", () => {
    expect(currentOffers([old, fresh, undated], NOW).map((o) => o.id)).toEqual(["fresh", "undated"]);
  });

  it("uses all of them when none is current, so a product still has a price to show", () => {
    expect(currentOffers([old, { id: "older", lastScrapedAt: daysAgo(60) }], NOW).map((o) => o.id)).toEqual(["old", "older"]);
  });

  it("gives an empty list for nothing", () => {
    expect(currentOffers([], NOW)).toEqual([]);
    expect(currentOffers(undefined, NOW)).toEqual([]);
  });
});

let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "laptop",
  ptaStatus: extractPtaStatus(title), inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [], ...over,
});

describe("the best deal of a product", () => {
  const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
  const title = "Acer Nitro V 15 ANV15-51-95FB 15.6 inch Intel Core i7 16GB RAM 512GB SSD";

  it("is never an offer whose price has not been checked for two weeks, however well it scores", () => {
    const [product] = group([
      listing("shophive", title, 300000, { lastScrapedAt: new Date(Date.now() - 45 * DAY).toISOString() }), // cheapest, but 45 days old
      listing("priceoye", title, 330000),
      listing("mega", title, 335000),
    ]);
    expect(product.offers).toHaveLength(3);
    expect(product.bestDeal.platform).not.toBe("shophive");
    expect(["priceoye", "mega"]).toContain(product.bestDeal.platform);
  });

  it("still has a best deal when every offer is old, so the product is not left without one", () => {
    const old = new Date(Date.now() - 45 * DAY).toISOString();
    const [product] = group([listing("shophive", title, 300000, { lastScrapedAt: old }), listing("priceoye", title, 330000, { lastScrapedAt: old })]);
    expect(product.bestDeal).not.toBeNull();
  });

  it("is unchanged when every offer is current", () => {
    const [product] = group([listing("shophive", title, 300000), listing("priceoye", title, 330000)]);
    expect(product.bestDeal).toBe(product.offers[0]);
  });
});
