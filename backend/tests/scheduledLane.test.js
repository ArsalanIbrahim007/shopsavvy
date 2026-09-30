import { describe, it, expect, vi, afterAll, afterEach } from "vitest";

import Listing from "../src/models/listing.model.js";
import { buildScheduledQueryList } from "../src/services/scheduledScraping.service.js";
import { closeGroupingPool, getGroupingPool } from "../src/services/grouping.service.js";

afterEach(() => vi.restoreAllMocks());
afterAll(() => closeGroupingPool());

describe("the scheduled-scrape query list", () => {
  // Enough listings that grouping goes to the worker pool rather than running in-thread.
  const listings = Array.from({ length: 50 }, (_, i) => ({
    _id: `6a78a2af9c96f297ede773${String(i).padStart(2, "0")}`, platform: i % 2 ? "priceoye" : "mega", price: 60000 + i,
    title: i < 10 ? "Samsung Galaxy A17 8GB 256GB" : `Samsung Galaxy A${20 + i} 5G Smartphone 8GB 256GB Black`,
    normalizedTitle: "x", productCategory: "smartphone", inStock: true,
  }));

  it("groups in the background lane with the rule matcher and no recommendations, because nobody is waiting for it", async () => {
    vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => listings });
    const run = vi.spyOn(getGroupingPool(), "run");

    const queries = await buildScheduledQueryList({ minOffers: 2 });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("group", expect.objectContaining({ strategy: "rule", recommend: false }), { priority: "background" });
    expect(queries.some((q) => /galaxy a17/i.test(q))).toBe(true); // the product sold by two stores becomes a query
  }, 60000);
});
