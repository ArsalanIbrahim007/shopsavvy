import { describe, it, expect, vi, afterAll, afterEach } from "vitest";

import Listing from "../src/models/listing.model.js";
import { closeGroupingPool } from "../src/services/grouping.service.js";
import { buildScheduledQueryList, buildScheduledQueryPlan, deriveQuery, pickStaleSingles, STALE_SINGLE_AFTER_DAYS, STALE_SINGLE_PER_RUN } from "../src/services/scheduledScraping.service.js";

afterEach(() => vi.restoreAllMocks());
afterAll(() => closeGroupingPool());

const candidate = (query, platform, lastScrapedAt) => ({ query, platform, lastScrapedAt });

describe("pickStaleSingles", () => {
  it("takes the oldest first within a store", () => {
    const picked = pickStaleSingles([candidate("b", "paklap", 20), candidate("a", "paklap", 10), candidate("c", "paklap", 30)], 3);
    expect(picked).toEqual(["a", "b", "c"]);
  });

  it("takes from each store in turn, so one large store cannot use up the night", () => {
    const priceoye = Array.from({ length: 50 }, (_, i) => candidate(`po${i}`, "priceoye", i));
    const paklap = [candidate("pk1", "paklap", 1000), candidate("pk2", "paklap", 2000)];
    const picked = pickStaleSingles([...priceoye, ...paklap], 6);
    expect(picked).toEqual(["po0", "pk1", "po1", "pk2", "po2", "po3"]); // Paklap's listings are far newer, yet it gets its turn
  });

  it("gives the remaining places to the stores that still have some, once a small store runs out", () => {
    const picked = pickStaleSingles([candidate("a1", "a", 1), candidate("b1", "b", 2), candidate("b2", "b", 3), candidate("b3", "b", 4)], 4);
    expect(picked).toEqual(["a1", "b1", "b2", "b3"]);
  });

  it("returns at most `count`, and fewer when there are not enough", () => {
    const many = Array.from({ length: 10 }, (_, i) => candidate(`q${i}`, "a", i));
    expect(pickStaleSingles(many, 3)).toHaveLength(3);
    expect(pickStaleSingles(many, 99)).toHaveLength(10);
    expect(pickStaleSingles(many, 0)).toEqual([]);
    expect(pickStaleSingles([], 5)).toEqual([]);
  });

  it("passes over a query that is already wanted without using up a place, and over a repeated one", () => {
    const picked = pickStaleSingles(
      [candidate("wanted", "a", 1), candidate("x", "a", 2), candidate("x", "b", 3), candidate("y", "b", 4), candidate("z", "a", 5)],
      3, new Set(["wanted"]),
    );
    expect(picked).toEqual(["x", "y", "z"]);
  });

  it("leaves the list it is given as it was", () => {
    const input = [candidate("b", "a", 2), candidate("a", "a", 1)];
    pickStaleSingles(input, 2);
    expect(input.map((c) => c.query)).toEqual(["b", "a"]);
  });
});

describe("buildScheduledQueryList also re-queries products only one store sells, once they are stale", () => {
  const NOW = Date.parse("2026-10-08T12:00:00Z");
  const daysAgo = (days) => new Date(NOW - days * 86400000);
  let n = 0;
  const listing = (platform, title, scraped, over = {}) => ({
    _id: `6a78a2af9c96f297ede77${String(++n).padStart(3, "0")}`, platform, title, normalizedTitle: "x", price: 90000 + n * 1000,
    productCategory: "laptop", inStock: true, lastScrapedAt: scraped, ...over,
  });
  const build = async (listings, options = {}) => {
    vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => listings });
    return buildScheduledQueryList({ now: NOW, ...options });
  };

  // Two stores sell the Dell; Paklap alone sells the Acer, the HP and the Lenovo.
  const shelf = () => [
    listing("paklap", "Dell Pro 15 Essential PV15250 Laptop", daysAgo(1)),
    listing("mega", "Dell Pro 15 Essential PV15250 Laptop", daysAgo(1)),
    listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(9)),
    listing("paklap", "HP 15 FD0912TU Laptop", daysAgo(2)),
    listing("paklap", "Lenovo IdeaPad Slim 3 15IRH10 Laptop", daysAgo(30)),
  ];

  it("keeps the defaults it documents", () => {
    expect(STALE_SINGLE_AFTER_DAYS).toBe(7);
    expect(STALE_SINGLE_PER_RUN).toBe(120);
  });

  it("adds a single-store product last refreshed more than 7 days ago, and leaves out one refreshed lately", async () => {
    const queries = await build(shelf());
    expect(queries).toContain(deriveQuery("Dell Pro 15 Essential PV15250 Laptop")); // sold by two stores: as before
    expect(queries).toContain(deriveQuery("Acer Aspire Go 15 AG15 Laptop")); // 9 days
    expect(queries).toContain(deriveQuery("Lenovo IdeaPad Slim 3 15IRH10 Laptop")); // 30 days
    expect(queries).not.toContain(deriveQuery("HP 15 FD0912TU Laptop")); // 2 days
  });

  it("treats a listing with no date as the oldest there is", async () => {
    const queries = await build([listing("paklap", "Acer Aspire Go 15 AG15 Laptop", undefined), listing("paklap", "HP 15 FD0912TU Laptop", null)]);
    expect(queries).toContain(deriveQuery("Acer Aspire Go 15 AG15 Laptop"));
    expect(queries).toContain(deriveQuery("HP 15 FD0912TU Laptop"));
  });

  it("is exactly 7 days that counts as stale, not 6", async () => {
    const queries = await build([listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(6.9)), listing("paklap", "HP 15 FD0912TU Laptop", daysAgo(7.1))]);
    expect(queries).not.toContain(deriveQuery("Acer Aspire Go 15 AG15 Laptop"));
    expect(queries).toContain(deriveQuery("HP 15 FD0912TU Laptop"));
  });

  it("adds at most `staleSingles`, the oldest first, and none when it is 0", async () => {
    const oldest = await build(shelf(), { staleSingles: 1 });
    expect(oldest).toContain(deriveQuery("Lenovo IdeaPad Slim 3 15IRH10 Laptop"));
    expect(oldest).not.toContain(deriveQuery("Acer Aspire Go 15 AG15 Laptop"));
    expect(oldest).toContain(deriveQuery("Dell Pro 15 Essential PV15250 Laptop"));

    const none = await build(shelf(), { staleSingles: 0 });
    expect(none).toEqual([deriveQuery("Dell Pro 15 Essential PV15250 Laptop")]);
  });

  it("respects staleAfterDays", async () => {
    const queries = await build(shelf(), { staleAfterDays: 20 });
    expect(queries).toContain(deriveQuery("Lenovo IdeaPad Slim 3 15IRH10 Laptop"));
    expect(queries).not.toContain(deriveQuery("Acer Aspire Go 15 AG15 Laptop"));
  });

  it("never lists a query twice, and never the demo queries", async () => {
    const listings = [
      listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(10)), listing("paklap", "Acer Aspire Go 15 AG15 Laptop 8GB", daysAgo(11)),
      listing("paklap", "Apple iPhone 17 Pro", daysAgo(20), { productCategory: "smartphone" }),
    ];
    const queries = await build(listings);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries).not.toContain("iphone 17 pro");
  });

  it("judges a group by its OLDEST offer: one stale offer is enough", async () => {
    const dell = "Dell Pro 15 Essential PV15250 Laptop";
    const listings = [listing("paklap", dell, daysAgo(1)), listing("mega", dell, daysAgo(30))];
    expect(await build(listings, { minOffers: 3 })).toContain(deriveQuery(dell)); // 2 offers, below 3: eligible, and its older offer is 30 days old
    expect(await build([listing("paklap", dell, daysAgo(1)), listing("mega", dell, daysAgo(2))], { minOffers: 3 })).not.toContain(deriveQuery(dell));
  });

  it("lists the stalest products first, whether compared or single-store, so a run that stops early skips the freshest", async () => {
    const dell = "Dell Pro 15 Essential PV15250 Laptop";
    const listings = [
      listing("paklap", dell, daysAgo(1)), listing("mega", dell, daysAgo(3)), // compared; oldest offer 3 days
      listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(9)), // single-store, 9 days
      listing("paklap", "Lenovo IdeaPad Slim 3 15IRH10 Laptop", daysAgo(30)), // single-store, 30 days
      listing("paklap", "HP 15 FD0912TU Laptop", daysAgo(5)), listing("mega", "HP 15 FD0912TU Laptop", daysAgo(20)), // compared; oldest offer 20 days
    ];
    const queries = await build(listings);
    expect(queries).toEqual([
      deriveQuery("Lenovo IdeaPad Slim 3 15IRH10 Laptop"), // 30
      deriveQuery("HP 15 FD0912TU Laptop"), // 20 (its older offer)
      deriveQuery("Acer Aspire Go 15 AG15 Laptop"), // 9
      deriveQuery(dell), // 3
    ]);
  });

  it("runs the queries run longest ago first, never-run ones before any, whatever the age of the listings (a delisted product must not hog the front)", async () => {
    const dell = "Dell Pro 15 Essential PV15250 Laptop";
    const listings = [
      listing("paklap", dell, daysAgo(60)), listing("mega", dell, daysAgo(61)), // a product with a listing that no search refreshes any more: "stalest" for ever
      listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(9)),
      listing("paklap", "Lenovo IdeaPad Slim 3 15IRH10 Laptop", daysAgo(30)),
      listing("paklap", "HP 15 FD0912TU Laptop", daysAgo(20)),
    ];
    const q = (title) => deriveQuery(title);
    const lastQueried = new Map([
      [q(dell), NOW - 1 * 86400000], // run yesterday
      [q("Lenovo IdeaPad Slim 3 15IRH10 Laptop"), NOW - 3 * 86400000], // run 3 days ago
      [q("HP 15 FD0912TU Laptop"), NOW - 2 * 86400000], // run 2 days ago
      // the Acer has never been run
    ]);
    expect(await build(listings, { lastQueried })).toEqual([
      q("Acer Aspire Go 15 AG15 Laptop"), q("Lenovo IdeaPad Slim 3 15IRH10 Laptop"), q("HP 15 FD0912TU Laptop"), q(dell),
    ]);
  });

  it("describes each query: its category, how old it is, and whether it is a compared product or a stale single-store one", async () => {
    const dell = "Dell Pro 15 Essential PV15250 Laptop";
    vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => [
      listing("paklap", dell, daysAgo(1)), listing("mega", dell, daysAgo(2)), listing("paklap", "Acer Aspire Go 15 AG15 Laptop", daysAgo(9), { productCategory: "tablet" }),
    ] });
    const plan = await buildScheduledQueryPlan({ now: NOW });
    expect(plan).toEqual([
      { query: deriveQuery("Acer Aspire Go 15 AG15 Laptop"), category: "tablet", lastScrapedAt: NOW - 9 * 86400000, kind: "stale-single" },
      { query: deriveQuery(dell), category: "laptop", lastScrapedAt: NOW - 2 * 86400000, kind: "compared" },
    ]);
  });

  it("lists one query once when two products give it (the same phone in two capacities), dated by the older of them", async () => {
    const phone = (platform, storage, days) => listing(platform, `Samsung Galaxy A17 ${storage} Black`, daysAgo(days), { productCategory: "smartphone", storageGb: storage === "128GB" ? 128 : 256 });
    vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => [
      phone("mega", "128GB", 1), phone("priceoye", "128GB", 2), // one product, refreshed lately
      phone("mega", "256GB", 10), phone("priceoye", "256GB", 11), // another, 11 days old
    ] });
    const plan = await buildScheduledQueryPlan({ now: NOW });
    const same = plan.filter((entry) => entry.query === deriveQuery("Samsung Galaxy A17 128GB Black"));
    expect(same).toHaveLength(1);
    expect(same[0].lastScrapedAt).toBe(NOW - 11 * 86400000);
  });

  it("with --min-offers=1 every product is already included, so nothing is added twice", async () => {
    const queries = await build(shelf(), { minOffers: 1 });
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries).toContain(deriveQuery("HP 15 FD0912TU Laptop")); // included by minOffers, though refreshed lately
  });
});
