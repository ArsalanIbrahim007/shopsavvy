import { describe, it, expect, vi, beforeEach } from "vitest";

// The scrapers are replaced with a stub so no request leaves the machine, and the
// database calls are spied on so we can see exactly what would be stored.
vi.mock("../src/scrapers/index.js", () => ({ scrapeAllPlatforms: vi.fn() }));

import { scrapeAllPlatforms } from "../src/scrapers/index.js";
import Listing from "../src/models/listing.model.js";
import PriceHistory from "../src/models/priceHistory.model.js";
import { runScrapersAndSave } from "../src/services/scraper.service.js";

const listing = (over) => ({
  platform: "priceoye",
  sourceUrl: "https://priceoye.pk/p/x",
  title: "Samsung Galaxy A17 8GB 256GB",
  price: 65000,
  ...over,
});

describe("saving scraped listings", () => {
  let upsert;
  let record;

  beforeEach(() => {
    upsert = vi.spyOn(Listing, "findOneAndUpdate").mockResolvedValue({});
    record = vi.spyOn(PriceHistory, "recordPrice").mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("skips a price that cannot be real, and stores the rest", async () => {
    scrapeAllPlatforms.mockResolvedValue([
      listing({ sourceUrl: "https://x.test/article", title: "Best Laptops Under 1 Lakh", price: 20 }),
      listing({ sourceUrl: "https://x.test/real", price: 65000 }),
    ]);

    const saved = await runScrapersAndSave("galaxy a17");

    expect(saved).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].sourceUrl).toBe("https://x.test/real");
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("drops a was-price that is not above the current price, in both the listing and its history", async () => {
    scrapeAllPlatforms.mockResolvedValue([
      listing({ sourceUrl: "https://x.test/a", price: 284999, originalPrice: 279999 }),
      listing({ sourceUrl: "https://x.test/b", price: 65000, originalPrice: 65000 }),
    ]);

    await runScrapersAndSave("tv");

    for (const call of upsert.mock.calls) expect(call[1].$set.originalPrice).toBeNull();
    for (const call of record.mock.calls) expect(call[0].originalPrice).toBeNull();
  });

  it("keeps a genuine was-price so the discount checks can judge it", async () => {
    scrapeAllPlatforms.mockResolvedValue([listing({ price: 65000, originalPrice: 80000 })]);

    await runScrapersAndSave("galaxy a17");

    expect(upsert.mock.calls[0][1].$set.originalPrice).toBe(80000);
    expect(record.mock.calls[0][0].originalPrice).toBe(80000);
  });

  it("validates ratings and specs from the scraper on the way in", async () => {
    scrapeAllPlatforms.mockResolvedValue([
      listing({ rating: 9, reviewCount: "1,204", specs: { RAM: "8 GB", "$bad": "x" } }),
    ]);

    await runScrapersAndSave("galaxy a17");

    const doc = upsert.mock.calls[0][1].$set;
    expect(doc.rating).toBeNull();
    expect(doc.reviewCount).toBe(1204);
    expect(doc.specs).toEqual({ RAM: "8 GB", bad: "x" });
  });

  it("retries once when another request stored the same product an instant earlier", async () => {
    scrapeAllPlatforms.mockResolvedValue([listing({})]);
    upsert.mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000 })).mockResolvedValueOnce({});

    const saved = await runScrapersAndSave("galaxy a17");

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(saved).toBe(1);
  });
});
