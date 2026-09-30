import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

vi.mock("../src/services/historyEnrichment.service.js", () => ({ attachPriceHistory: async (listings) => listings }));

import Listing from "../src/models/listing.model.js";
import {
  rankDealGroups,
  computeCategoryDeals,
  MIN_SAVING_PERCENT,
  MIN_SAVING_AMOUNT,
  MAX_PRICE_SPREAD,
  MIN_OFFERS,
} from "../src/services/dealsRanking.service.js";
import { getTopDeals, computeDealsInWorker, clearDealsCache, DEAL_CATEGORIES } from "../src/services/dealsFeed.service.js";
import { createApp } from "../src/createApp.js";

const NOW = new Date("2026-09-30T12:00:00Z").getTime();
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, inStock: true, productCategory: "smartphone", ptaStatus: "pta_approved",
  lastScrapedAt: hoursAgo(2), dealScore: 70, ...over,
});
const group = (name, offers) => ({ productName: name, offers });

describe("rankDealGroups", () => {
  it("measures the saving against the median of the offers, not a store's own was-price", () => {
    const [deal] = rankDealGroups([group("Phone", [
      offer("a", "priceoye", 60000, { originalPrice: 90000 }),
      offer("b", "mega", 70000),
      offer("c", "shophive", 72000),
    ])], { now: NOW });

    expect(deal.referencePrice).toBe(70000);
    expect(deal.savingAmount).toBe(10000);
    expect(deal.savingPercent).toBe(14.3);
    expect(deal.lowest).toMatchObject({ _id: "a", platform: "priceoye", price: 60000 });
    expect(deal.offerCount).toBe(3);
    expect(deal.storeCount).toBe(3);
  });

  it("ranks the biggest percentage saving first", () => {
    const deals = rankDealGroups([
      group("Small", [offer("a", "priceoye", 95000), offer("b", "mega", 100000), offer("c", "shophive", 100000)]),
      group("Big", [offer("d", "priceoye", 70000), offer("e", "mega", 100000), offer("f", "shophive", 100000)]),
    ], { now: NOW });
    expect(deals.map((d) => d.productName)).toEqual(["Big", "Small"]);
  });

  it("needs two different stores: one store cannot be compared with itself", () => {
    expect(rankDealGroups([group("P", [offer("a", "priceoye", 60000), offer("b", "priceoye", 80000), offer("c", "priceoye", 82000)])], { now: NOW })).toEqual([]);
    expect(rankDealGroups([group("P", [offer("a", "priceoye", 60000)])], { now: NOW })).toEqual([]);
  });

  it("ignores stale offers: a price last seen days ago may be gone", () => {
    const deals = rankDealGroups([group("P", [
      offer("a", "priceoye", 60000, { lastScrapedAt: hoursAgo(200) }),
      offer("b", "mega", 90000),
      offer("c", "shophive", 92000),
      offer("d", "telemart", 91000),
    ])], { now: NOW });
    // The stale bargain is not used; the fresh offers are 90,000 to 92,000, too close for a deal.
    expect(deals).toEqual([]);
  });

  it("ignores out-of-stock offers", () => {
    const deals = rankDealGroups([group("P", [
      offer("a", "priceoye", 60000, { inStock: false }),
      offer("b", "mega", 90000),
      offer("c", "shophive", 91000),
      offer("d", "telemart", 92000),
    ])], { now: NOW });
    expect(deals).toEqual([]);
  });

  it("never presents an offer flagged as a probable listing error as a bargain", () => {
    const deals = rankDealGroups([group("P", [
      offer("bogus", "telemart", 60000, { priceCheck: { status: "suspect_low" } }),
      offer("b", "mega", 90000),
      offer("c", "shophive", 92000),
      offer("d", "paklap", 91000),
    ])], { now: NOW });
    expect(deals).toEqual([]);
  });

  it("does not compare a used, open-box or non-PTA unit with new ones: that saving is a downgrade", () => {
    for (const cheaper of [{ condition: "used" }, { condition: "refurbished" }, { condition: "open_box" }, { ptaStatus: "non_pta" }]) {
      const deals = rankDealGroups([group("P", [
        offer("a", "priceoye", 60000, cheaper),
        offer("b", "mega", 90000),
        offer("c", "shophive", 92000),
        offer("d", "telemart", 91000),
      ])], { now: NOW });
      expect(deals, JSON.stringify(cheaper)).toEqual([]);
    }
  });

  it("treats a missing condition as new, and PTA-approved or unknown PTA as comparable", () => {
    const deals = rankDealGroups([group("P", [
      offer("a", "priceoye", 60000, { ptaStatus: "pta_approved" }),
      offer("b", "mega", 90000, { ptaStatus: "unknown" }),
      offer("c", "shophive", 92000),
    ])], { now: NOW });
    expect(deals).toHaveLength(1);
  });

  it("only advertises a phone or tablet deal when the cheapest offer is explicitly PTA-approved", () => {
    // A bare-title phone at 60,000 against 90,000: that gap is what a non-PTA unit looks like, so with
    // PTA status unstated it must not be presented as a bargain.
    const others = [offer("b", "mega", 90000), offer("c", "shophive", 92000), offer("d", "telemart", 91000)];
    for (const status of ["unknown", undefined]) {
      expect(rankDealGroups([group("P", [offer("a", "priceoye", 60000, { ptaStatus: status }), ...others])], { now: NOW }), String(status)).toEqual([]);
    }
    const approved = rankDealGroups([group("P", [offer("a", "priceoye", 60000, { ptaStatus: "pta_approved" }), ...others])], { now: NOW });
    expect(approved).toHaveLength(1);
    expect(approved[0].lowest.ptaStatus).toBe("pta_approved");
  });

  it("a non-PTA unit neither wins nor hides the cheapest PTA-approved deal", () => {
    // The 60,000 non-PTA unit is the cheapest offer, but it is a different product. Left in, it would
    // become "the cheapest", fail the PTA rule, and take the whole group down with it, hiding the genuine
    // 70,000 PTA-approved deal against the 90,000+ offers.
    const deals = rankDealGroups([group("P", [
      offer("non", "mega", 60000, { ptaStatus: "non_pta" }),
      offer("a", "priceoye", 70000, { ptaStatus: "pta_approved" }),
      offer("b", "shophive", 90000),
      offer("c", "telemart", 92000),
    ])], { now: NOW });
    expect(deals).toHaveLength(1);
    expect(deals[0].lowest._id).toBe("a");
  });

  it("does not apply the PTA rule to categories where it means nothing", () => {
    const tv = (id, platform, price) => offer(id, platform, price, { productCategory: "tv" });
    const deals = rankDealGroups([group("TV", [tv("a", "priceoye", 60000), tv("b", "mega", 90000), tv("c", "shophive", 92000)])], { now: NOW });
    expect(deals).toHaveLength(1);
  });

  it("needs at least three offers: with two, a saving is one price against one price", () => {
    expect(rankDealGroups([group("Two", [offer("a", "priceoye", 60000), offer("b", "mega", 80000)])], { now: NOW })).toEqual([]);
    expect(MIN_OFFERS).toBe(3);
  });

  it("skips a group whose prices are too far apart to be one product (mixed variants)", () => {
    // Three stores at 100,000 and one at 60,000: the median makes the cheap one look like a 40% saving,
    // but a 1.67x spread between the cheapest and dearest means these are not like-for-like units.
    const mixed = group("Mixed", [
      offer("a", "priceoye", 60000),
      offer("b", "mega", 100000),
      offer("c", "shophive", 100000),
      offer("d", "telemart", 100000),
    ]);
    expect(rankDealGroups([mixed], { now: NOW })).toEqual([]);
    expect(MAX_PRICE_SPREAD).toBe(1.6);

    // The same shape just inside the limit is a deal, so the test above is about the spread and nothing else.
    const comparable = group("Comparable", [
      offer("a", "priceoye", 65000),
      offer("b", "mega", 100000),
      offer("c", "shophive", 100000),
      offer("d", "telemart", 100000),
    ]);
    expect(rankDealGroups([comparable], { now: NOW })).toHaveLength(1);
  });

  it("requires a meaningful saving in both percent and rupees", () => {
    // 6% but only PKR 300: not a deal.
    expect(rankDealGroups([group("Cheap", [offer("a", "priceoye", 4700), offer("b", "mega", 5000), offer("c", "shophive", 5000)])], { now: NOW })).toEqual([]);
    // PKR 5,000 but only 1%: not a deal.
    expect(rankDealGroups([group("Dear", [offer("a", "priceoye", 495000), offer("b", "mega", 500000), offer("c", "shophive", 500000)])], { now: NOW })).toEqual([]);
    expect(MIN_SAVING_PERCENT).toBe(5);
    expect(MIN_SAVING_AMOUNT).toBe(1000);
  });

  it("reports a verified discount only when no check doubts it", () => {
    const base = [offer("b", "mega", 100000), offer("c", "shophive", 100000)];
    const honest = rankDealGroups([group("P", [offer("a", "priceoye", 80000, { originalPrice: 100000 }), ...base])], { now: NOW })[0];
    const fake = rankDealGroups([group("P", [offer("a", "priceoye", 80000, { originalPrice: 100000, discountAnalysis: { isFakeDiscount: true } }), ...base])], { now: NOW })[0];
    expect(honest.verifiedDiscountPercent).toBe(20);
    expect(fake.verifiedDiscountPercent).toBeNull();
  });

  it("reports the newest scrape time among the offers it used, and carries the recommendation", () => {
    const [deal] = rankDealGroups([group("P", [
      offer("a", "priceoye", 60000, { lastScrapedAt: hoursAgo(5), recommendation: { action: "BUY_NOW" } }),
      offer("b", "mega", 90000, { lastScrapedAt: hoursAgo(1) }),
      offer("c", "shophive", 91000, { lastScrapedAt: hoursAgo(9) }),
    ])], { now: NOW });
    expect(deal.updatedAt).toBe(hoursAgo(1));
    expect(deal.recommendation).toBe("BUY_NOW");
  });

  it("breaks a price tie by deal score", () => {
    const [deal] = rankDealGroups([group("P", [
      offer("low-score", "priceoye", 60000, { dealScore: 40 }),
      offer("high-score", "mega", 60000, { dealScore: 90 }),
      offer("c", "shophive", 80000),
      offer("d", "telemart", 80000),
    ])], { now: NOW });
    expect(deal.lowest._id).toBe("high-score");
  });
});

describe("the full pipeline", () => {
  const listings = [
    { ...offer("l1", "priceoye", 60000), title: "Samsung Galaxy A17 8GB 256GB", normalizedTitle: "samsung galaxy a17 256gb" },
    { ...offer("l2", "mega", 72000), title: "Samsung Galaxy A17 8GB 256GB", normalizedTitle: "samsung galaxy a17 256gb" },
    { ...offer("l3", "shophive", 73000), title: "Samsung Galaxy A17 8GB 256GB", normalizedTitle: "samsung galaxy a17 256gb" },
  ];

  it("groups real listings and finds the deal", () => {
    const deals = computeCategoryDeals(listings, { now: NOW });
    expect(deals).toHaveLength(1);
    expect(deals[0].lowest.platform).toBe("priceoye");
    expect(deals[0].savingAmount).toBeGreaterThan(10000);
  });

  it("gives the same answer from a real worker thread, with ids as strings", async () => {
    const direct = computeCategoryDeals(listings, { now: NOW });
    const fromWorker = await computeDealsInWorker(listings, { now: NOW });
    expect(fromWorker).toEqual(direct);
  });

  it("reports a failure inside the worker instead of hanging", async () => {
    // A BigInt "now" cannot be mixed with numbers, so the ranking throws inside the worker.
    await expect(computeDealsInWorker(listings, { now: 10n }, { timeoutMs: 20000 })).rejects.toThrow(/BigInt|mix/i);
  });

  it("gives up and rejects when the worker takes too long", async () => {
    await expect(computeDealsInWorker(listings, { now: NOW }, { timeoutMs: 1 })).rejects.toThrow(/timed out/);
  });
});

describe("getTopDeals cache", () => {
  const listings = [
    { ...offer("l1", "priceoye", 60000, { lastScrapedAt: new Date().toISOString() }), title: "Samsung Galaxy A17 8GB 256GB" },
    { ...offer("l2", "mega", 72000, { lastScrapedAt: new Date().toISOString() }), title: "Samsung Galaxy A17 8GB 256GB" },
    { ...offer("l3", "shophive", 73000, { lastScrapedAt: new Date().toISOString() }), title: "Samsung Galaxy A17 8GB 256GB" },
  ];
  let find;

  beforeEach(() => {
    clearDealsCache();
    find = vi.spyOn(Listing, "find").mockImplementation((filter) => ({
      lean: async () => (filter.productCategory === "smartphone" ? listings : []),
    }));
  });

  afterAll(() => vi.restoreAllMocks());

  it("computes once, then answers from the cache", async () => {
    const first = await getTopDeals({ category: "smartphone" });
    expect(first.deals).toHaveLength(1);
    expect(find).toHaveBeenCalledTimes(1);

    await getTopDeals({ category: "smartphone" });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("shares one computation between simultaneous requests", async () => {
    await Promise.all([getTopDeals({ category: "smartphone" }), getTopDeals({ category: "smartphone" }), getTopDeals({ category: "smartphone" })]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the cache expires", async () => {
    const t = Date.now();
    await getTopDeals({ category: "smartphone", now: t });
    await getTopDeals({ category: "smartphone", now: t + 11 * 60 * 1000 });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("covers every deal category when none is named, and respects the limit", async () => {
    const all = await getTopDeals({ limit: 5 });
    expect(find).toHaveBeenCalledTimes(DEAL_CATEGORIES.length);
    expect(all.deals.length).toBeLessThanOrEqual(5);
    expect(typeof all.generatedAt).toBe("string");
  });

  it("only asks the database for fresh, visible listings of that category", async () => {
    await getTopDeals({ category: "smartphone" });
    const filter = find.mock.calls[0][0];
    expect(filter.productCategory).toBe("smartphone");
    expect(filter.lastScrapedAt.$gte).toBeInstanceOf(Date);
    expect(filter.platform.$nin).toContain("daraz");
  });
});

describe("the deals and suggest endpoints, without a database", () => {
  let server;
  let url;
  beforeAll(async () => {
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("rejects an unknown deals category with a coded 400", async () => {
    const res = await fetch(`${url}/api/listings/deals?category=bogus`);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toContain("smartphone");
  });

  it("answers an empty list for a suggestion query that is too short, without touching the database", async () => {
    const res = await fetch(`${url}/api/listings/suggest?q=a`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, count: 0, data: [] });
  });

  it("rejects an over-long suggestion query", async () => {
    const res = await fetch(`${url}/api/listings/suggest?q=${"a".repeat(101)}`);
    expect(res.status).toBe(400);
  });

  it("does not treat a non-text q as anything but empty", async () => {
    const res = await fetch(`${url}/api/listings/suggest?q[]=x`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
