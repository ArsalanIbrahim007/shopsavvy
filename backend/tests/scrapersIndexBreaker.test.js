import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The live searches since 2026-11-19: PriceOye, Paklap and W11Stop are no longer searched (their robots.txt forbids it; they are read
// through pages it allows), so the stores below are the ones still asked: Mega answers, Shophive and iShopping fail.
vi.mock("../src/scrapers/mega.scraper.js", () => ({ scrapeMegaSearch: vi.fn() }));
vi.mock("../src/scrapers/shophive.scraper.js", () => ({ scrapeShophiveSearch: vi.fn() }));
vi.mock("../src/scrapers/ishopping.scraper.js", () => ({ scrapeIShoppingSearch: vi.fn() }));
vi.mock("../src/scrapers/stores.js", () => ({ storeTasks: vi.fn(() => []) }));

import { scrapeMegaSearch } from "../src/scrapers/mega.scraper.js";
import { scrapeFixedPlatforms } from "../src/scrapers/index.js";
import { storeBreaker } from "../src/scrapers/storeBreaker.js";
import { scrapeShophiveSearch } from "../src/scrapers/shophive.scraper.js";
import { scrapeIShoppingSearch } from "../src/scrapers/ishopping.scraper.js";

const phone = (platform) => ({ platform, title: "Samsung Galaxy A17 128GB", price: 60000, sourceUrl: `https://${platform}.example/a17` });

beforeEach(() => {
  storeBreaker.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of [scrapeMegaSearch, scrapeShophiveSearch, scrapeIShoppingSearch]) {
    vi.mocked(fn).mockReset().mockResolvedValue([]);
  }
  vi.mocked(scrapeMegaSearch).mockResolvedValue([phone("mega")]);
});
afterEach(() => { vi.restoreAllMocks(); storeBreaker.reset(); });

// The nightly refresh asks only the stores that sell the product (scheduledScraping.service.js refreshStores, 2026-11-07).
describe("scrapeAllPlatforms with a list of stores", () => {
  it("asks only those stores, and every store without a list", async () => {
    const { scrapeAllPlatforms } = await import("../src/scrapers/index.js");
    await scrapeAllPlatforms("haier fridge", { platforms: ["mega", "shophive"] });
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(1);
    expect(scrapeShophiveSearch).toHaveBeenCalledTimes(1);
    expect(scrapeIShoppingSearch).not.toHaveBeenCalled();

    await scrapeAllPlatforms("haier fridge");
    expect(scrapeIShoppingSearch).toHaveBeenCalledTimes(1);
  });
});

describe("the searches robots.txt forbids (2026-11-19)", () => {
  it("are not in the live searches: PriceOye, Paklap and W11Stop", async () => {
    const { scrapeAllPlatforms } = await import("../src/scrapers/index.js");
    const { report } = await scrapeAllPlatforms("haier fridge", { withReport: true });
    const asked = report.map((r) => r.platform);
    for (const store of ["priceoye", "paklap", "w11stop"]) expect(asked).not.toContain(store);
    expect(asked).toEqual(expect.arrayContaining(["mega", "shophive", "ishopping"]));
  });
});

describe("scrapeFixedPlatforms with a store that does not answer", () => {
  it("keeps returning the other stores' listings while a store keeps failing", async () => {
    vi.mocked(scrapeShophiveSearch).mockRejectedValue(new Error("HTTP 429"));
    const results = await scrapeFixedPlatforms("samsung galaxy a17");
    expect(results.map((l) => l.platform)).toEqual(["mega"]);
  });

  it("stops asking that store after five failures in a row, and keeps asking the others", async () => {
    vi.mocked(scrapeShophiveSearch).mockRejectedValue(new Error("HTTP 429"));
    for (let i = 0; i < 20; i++) await scrapeFixedPlatforms("samsung galaxy a17");
    expect(scrapeShophiveSearch).toHaveBeenCalledTimes(5);
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(20);
    expect(storeBreaker.paused().map((s) => s.platform)).toEqual(["shophive"]);
  });

  it("pauses several stores independently (Shophive refusing, iShopping's browser missing)", async () => {
    vi.mocked(scrapeShophiveSearch).mockRejectedValue(new Error("HTTP 429"));
    vi.mocked(scrapeIShoppingSearch).mockRejectedValue(new Error("Executable doesn't exist"));
    for (let i = 0; i < 8; i++) await scrapeFixedPlatforms("samsung galaxy a17");
    expect(scrapeShophiveSearch).toHaveBeenCalledTimes(5);
    expect(scrapeIShoppingSearch).toHaveBeenCalledTimes(5);
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(8);
  });

  it("does not pause a store that answers with nothing (an empty search is not a failure)", async () => {
    vi.mocked(scrapeMegaSearch).mockResolvedValue([]);
    for (let i = 0; i < 20; i++) await scrapeFixedPlatforms("a search nobody sells");
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(20);
    expect(storeBreaker.paused()).toEqual([]);
  });

  it("does not pause a store whose failures are not in a row", async () => {
    vi.mocked(scrapeShophiveSearch).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"));
    for (let i = 0; i < 9; i++) await scrapeFixedPlatforms("q");
    expect(scrapeShophiveSearch).toHaveBeenCalledTimes(9);
  });

  it("tries a paused store again after the pause, and takes it back when it answers", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-13T17:00:00Z"));
      vi.mocked(scrapeShophiveSearch).mockRejectedValue(new Error("HTTP 429"));
      for (let i = 0; i < 6; i++) await scrapeFixedPlatforms("q");
      expect(scrapeShophiveSearch).toHaveBeenCalledTimes(5);

      vi.setSystemTime(new Date("2026-10-13T17:05:00Z")); // five minutes on
      vi.mocked(scrapeShophiveSearch).mockResolvedValue([{ ...phone("shophive"), title: "Samsung Galaxy A17" }]);
      const results = await scrapeFixedPlatforms("samsung galaxy a17");
      expect(scrapeShophiveSearch).toHaveBeenCalledTimes(6); // the probe
      expect(results.map((l) => l.platform).sort()).toEqual(["mega", "shophive"]);
      await scrapeFixedPlatforms("samsung galaxy a17");
      expect(scrapeShophiveSearch).toHaveBeenCalledTimes(7); // back to normal
      expect(storeBreaker.paused()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
