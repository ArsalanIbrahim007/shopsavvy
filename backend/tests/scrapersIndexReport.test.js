// backend/tests/scrapersIndexReport.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/scrapers/priceoye.scraper.js",  () => ({ scrapePriceOyeSearch:  vi.fn() }));
vi.mock("../src/scrapers/mega.scraper.js",       () => ({ scrapeMegaSearch:      vi.fn() }));
vi.mock("../src/scrapers/shophive.scraper.js",   () => ({ scrapeShophiveSearch:  vi.fn() }));
vi.mock("../src/scrapers/paklap.scraper.js",     () => ({ scrapePaklapSearch:    vi.fn() }));
vi.mock("../src/scrapers/w11stop.scraper.js",    () => ({ scrapeW11StopSearch:   vi.fn() }));
vi.mock("../src/scrapers/telemart.scraper.js",   () => ({ scrapeTelemartSearch:  vi.fn() }));
vi.mock("../src/scrapers/ishopping.scraper.js",  () => ({ scrapeIShoppingSearch: vi.fn() }));
vi.mock("../src/scrapers/stores.js",             () => ({ storeTasks: vi.fn(() => []) }));
vi.mock("../src/scrapers/storeBreaker.js",       () => ({
  storeBreaker: { allow: vi.fn(() => true), success: vi.fn(), failure: vi.fn() },
}));
vi.mock("../src/scrapers/productCategory.js", () => ({
  detectCategory:      vi.fn(() => ({ category: "phone", confidence: 0.9 })),
  detectQueryCategory: vi.fn(() => ({ category: "phone" })),
}));
vi.mock("../src/config/logSafe.js", () => ({ quote: vi.fn((s) => `"${s}"`) }));

import { scrapePriceOyeSearch }  from "../src/scrapers/priceoye.scraper.js";
import { scrapeMegaSearch }      from "../src/scrapers/mega.scraper.js";
import { scrapeShophiveSearch }  from "../src/scrapers/shophive.scraper.js";
import { scrapePaklapSearch }    from "../src/scrapers/paklap.scraper.js";
import { scrapeW11StopSearch }   from "../src/scrapers/w11stop.scraper.js";
import { scrapeTelemartSearch }  from "../src/scrapers/telemart.scraper.js";
import { scrapeIShoppingSearch } from "../src/scrapers/ishopping.scraper.js";
import { storeBreaker }          from "../src/scrapers/storeBreaker.js";
import { scrapeAllPlatforms }    from "../src/scrapers/index.js";

// Minimal listing stub — matches scraper.schema.js required fields
const stub = (platform) => ({
  platform,
  title: "Samsung Galaxy S24 128GB",
  price: 150000,
  originalPrice: null,
  sourceUrl: `https://${platform}.pk/product/s24`,
  productUrl: `https://${platform}.pk/product/s24`,
  imageUrl:   `https://${platform}.pk/img/s24.jpg`,
  brand: "Samsung",
  inStock: true,
  scrapedAt: new Date(),
});

function silenceAll() {
  [scrapePriceOyeSearch, scrapeMegaSearch, scrapeShophiveSearch,
   scrapePaklapSearch, scrapeW11StopSearch, scrapeTelemartSearch,
   scrapeIShoppingSearch].forEach((m) => m.mockResolvedValue([]));
}

beforeEach(() => {
  vi.clearAllMocks();
  storeBreaker.allow.mockReturnValue(true);
});

describe("scrapeAllPlatforms — withReport:true", () => {
  it("status ok when scraper returns listings", async () => {
    silenceAll();
    scrapePriceOyeSearch.mockResolvedValue([stub("priceoye"), stub("priceoye")]);

    const { report } = await scrapeAllPlatforms("samsung s24", { withReport: true });
    const po = report.find((r) => r.platform === "priceoye");

    expect(po.status).toBe("ok");
    expect(po.fetched).toBe(2);
    expect(typeof po.durationMs).toBe("number");
    expect(po.error).toBeUndefined();
  });

  it("status empty when scraper returns zero listings", async () => {
    silenceAll(); // all return []

    const { report } = await scrapeAllPlatforms("nonexistent xyz", { withReport: true });
    const po = report.find((r) => r.platform === "priceoye");

    expect(po.status).toBe("empty");
    expect(po.fetched).toBe(0);
  });

  it("status error when scraper throws", async () => {
    silenceAll();
    scrapePriceOyeSearch.mockRejectedValue(new Error("network timeout"));

    const { listings, report } = await scrapeAllPlatforms("iphone 17", { withReport: true });
    const po = report.find((r) => r.platform === "priceoye");

    expect(po.status).toBe("error");
    expect(po.error).toMatch(/network timeout/i);
    // other stores still returned; search not broken (NFR-06)
    expect(Array.isArray(listings)).toBe(true);
  });

  it("status blocked on HTTP 403", async () => {
    silenceAll();
    scrapePriceOyeSearch.mockRejectedValue(new Error("HTTP 403 Forbidden"));

    const { report } = await scrapeAllPlatforms("iphone", { withReport: true });
    const po = report.find((r) => r.platform === "priceoye");

    expect(po.status).toBe("blocked");
  });

  it("status paused when storeBreaker.allow returns false", async () => {
    silenceAll();
    storeBreaker.allow.mockImplementation((p) => p !== "priceoye");

    const { report } = await scrapeAllPlatforms("iphone", { withReport: true });
    const po = report.find((r) => r.platform === "priceoye");

    expect(po.status).toBe("paused");
    // paused store must NOT have been called
    expect(scrapePriceOyeSearch).not.toHaveBeenCalled();
  });

  it("default call (no withReport) returns plain array, not object", async () => {
    silenceAll();
    scrapePriceOyeSearch.mockResolvedValue([stub("priceoye")]);

    const result = await scrapeAllPlatforms("samsung");

    expect(Array.isArray(result)).toBe(true);   // old callers unaffected
    expect(result.report).toBeUndefined();
  });

  it("report contains an entry for every registered platform", async () => {
    silenceAll();

    const { report } = await scrapeAllPlatforms("laptop", { withReport: true });
    const platforms = report.map((r) => r.platform);

    expect(platforms).toContain("priceoye");
    expect(platforms).toContain("mega");
    expect(platforms).toContain("shophive");
    expect(platforms).toContain("w11stop");
    expect(platforms).toContain("telemart");
    expect(platforms).toContain("ishopping");
    expect(platforms).toContain("paklap");
  });
});