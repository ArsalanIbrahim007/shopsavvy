import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/scrapers/priceoye.scraper.js", () => ({ scrapePriceOyeSearch: vi.fn() }));
vi.mock("../src/scrapers/mega.scraper.js", () => ({ scrapeMegaSearch: vi.fn() }));
vi.mock("../src/scrapers/shophive.scraper.js", () => ({ scrapeShophiveSearch: vi.fn() }));
vi.mock("../src/scrapers/paklap.scraper.js", () => ({ scrapePaklapSearch: vi.fn() }));
vi.mock("../src/scrapers/w11stop.scraper.js", () => ({ scrapeW11StopSearch: vi.fn() }));
vi.mock("../src/scrapers/ishopping.scraper.js", () => ({ scrapeIShoppingSearch: vi.fn() }));
vi.mock("../src/scrapers/stores.js", () => ({ storeTasks: vi.fn(() => []) }));

import { scrapePriceOyeSearch } from "../src/scrapers/priceoye.scraper.js";
import { scrapePaklapSearch } from "../src/scrapers/paklap.scraper.js";
import { scrapeMegaSearch } from "../src/scrapers/mega.scraper.js";
import { scrapeFixedPlatforms } from "../src/scrapers/index.js";
import { storeBreaker } from "../src/scrapers/storeBreaker.js";
import { scrapeShophiveSearch } from "../src/scrapers/shophive.scraper.js";
import { scrapeW11StopSearch } from "../src/scrapers/w11stop.scraper.js";
import { scrapeIShoppingSearch } from "../src/scrapers/ishopping.scraper.js";

const phone = (platform) => ({ platform, title: "Samsung Galaxy A17 128GB", price: 60000, sourceUrl: `https://${platform}.example/a17` });

beforeEach(() => {
  storeBreaker.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of [scrapePriceOyeSearch, scrapeMegaSearch, scrapeShophiveSearch, scrapePaklapSearch, scrapeW11StopSearch, scrapeIShoppingSearch]) {
    vi.mocked(fn).mockReset().mockResolvedValue([]);
  }
  vi.mocked(scrapePriceOyeSearch).mockResolvedValue([phone("priceoye")]);
});
afterEach(() => { vi.restoreAllMocks(); storeBreaker.reset(); });

describe("scrapeFixedPlatforms with a store that does not answer", () => {
  it("keeps returning the other stores' listings while a store keeps failing", async () => {
    vi.mocked(scrapeW11StopSearch).mockRejectedValue(new Error("HTTP 429"));
    const results = await scrapeFixedPlatforms("samsung galaxy a17");
    expect(results.map((l) => l.platform)).toEqual(["priceoye"]);
  });

  it("stops asking that store after five failures in a row, and keeps asking the others", async () => {
    vi.mocked(scrapeW11StopSearch).mockRejectedValue(new Error("HTTP 429"));
    for (let i = 0; i < 20; i++) await scrapeFixedPlatforms("samsung galaxy a17");
    expect(scrapeW11StopSearch).toHaveBeenCalledTimes(5);
    expect(scrapePriceOyeSearch).toHaveBeenCalledTimes(20);
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(20);
    expect(storeBreaker.paused().map((s) => s.platform)).toEqual(["w11stop"]);
  });

  it("pauses several stores independently (W11Stop refusing, Paklap's browser missing)", async () => {
    vi.mocked(scrapeW11StopSearch).mockRejectedValue(new Error("HTTP 429"));
    vi.mocked(scrapePaklapSearch).mockRejectedValue(new Error("Executable doesn't exist"));
    for (let i = 0; i < 8; i++) await scrapeFixedPlatforms("samsung galaxy a17");
    expect(scrapeW11StopSearch).toHaveBeenCalledTimes(5);
    expect(scrapePaklapSearch).toHaveBeenCalledTimes(5);
    expect(scrapeIShoppingSearch).toHaveBeenCalledTimes(8);
  });

  it("does not pause a store that answers with nothing (an empty search is not a failure)", async () => {
    for (let i = 0; i < 20; i++) await scrapeFixedPlatforms("a search nobody sells");
    expect(scrapeMegaSearch).toHaveBeenCalledTimes(20);
    expect(storeBreaker.paused()).toEqual([]);
  });

  it("does not pause a store whose failures are not in a row", async () => {
    vi.mocked(scrapeW11StopSearch).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"));
    for (let i = 0; i < 9; i++) await scrapeFixedPlatforms("q");
    expect(scrapeW11StopSearch).toHaveBeenCalledTimes(9);
  });

  it("tries a paused store again after the pause, and takes it back when it answers", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-13T17:00:00Z"));
      vi.mocked(scrapeW11StopSearch).mockRejectedValue(new Error("HTTP 429"));
      for (let i = 0; i < 6; i++) await scrapeFixedPlatforms("q");
      expect(scrapeW11StopSearch).toHaveBeenCalledTimes(5);

      vi.setSystemTime(new Date("2026-10-13T17:05:00Z")); // five minutes on
      vi.mocked(scrapeW11StopSearch).mockResolvedValue([{ ...phone("w11stop"), title: "Samsung Galaxy A17" }]);
      const results = await scrapeFixedPlatforms("samsung galaxy a17");
      expect(scrapeW11StopSearch).toHaveBeenCalledTimes(6); // the probe
      expect(results.map((l) => l.platform).sort()).toEqual(["priceoye", "w11stop"]);
      await scrapeFixedPlatforms("samsung galaxy a17");
      expect(scrapeW11StopSearch).toHaveBeenCalledTimes(7); // back to normal
      expect(storeBreaker.paused()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
