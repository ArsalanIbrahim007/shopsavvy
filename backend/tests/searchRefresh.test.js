// Stored-first search (2026-10-26): a query we hold listings for, only older than the freshness window, is answered at once and
// refreshed in the background; one we hold nothing for still waits for the scrape. Measured before: a cold search waited 10 to 17 s
// for every store, though the database already held its products.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/scrapers/index.js", () => ({ scrapeAllPlatforms: vi.fn() }));

import { scrapeAllPlatforms } from "../src/scrapers/index.js";
import Listing from "../src/models/listing.model.js";
import PriceHistory from "../src/models/priceHistory.model.js";
import { fetchAndRefreshListings, storedDataState } from "../src/services/scraper.service.js";

/** What the database holds for the query: "fresh", "stale" or "missing". */
function holding(state) {
  vi.spyOn(Listing, "countDocuments").mockResolvedValue(state === "fresh" ? 3 : 0);
  vi.spyOn(Listing, "exists").mockResolvedValue(state === "missing" ? null : { _id: "x" });
}

/** A scrape that finishes only when told to, so a test can see whether the search waited for it. */
function slowScrape() {
  let finish;
  scrapeAllPlatforms.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  return (listings = [{ platform: "priceoye", sourceUrl: "https://priceoye.pk/p/a", title: "Samsung Galaxy A17", price: 65000 }]) => finish(listings);
}

const settled = async (promise) => {
  let done = false;
  promise.then(() => { done = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return done;
};

beforeEach(() => {
  vi.restoreAllMocks();
  scrapeAllPlatforms.mockReset();
  vi.spyOn(Listing, "findOneAndUpdate").mockResolvedValue({});
  vi.spyOn(PriceHistory, "recordPrice").mockResolvedValue({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("storedDataState", () => {
  it("tells fresh, stale and missing apart", async () => {
    holding("fresh");
    expect(await storedDataState("galaxy a17")).toBe("fresh");
    holding("stale");
    expect(await storedDataState("galaxy a17")).toBe("stale");
    holding("missing");
    expect(await storedDataState("galaxy a17")).toBe("missing");
  });
});

describe("fetchAndRefreshListings", () => {
  it("does not scrape when the stored data is fresh", async () => {
    holding("fresh");
    expect(await fetchAndRefreshListings("galaxy a17", { background: true })).toEqual({ scraped: false, reason: "fresh_data" });
    expect(scrapeAllPlatforms).not.toHaveBeenCalled();
  });

  it("answers at once for stale data, and refreshes in the background", async () => {
    holding("stale");
    const finish = slowScrape();
    const result = await fetchAndRefreshListings("galaxy a17 stale", { background: true });

    expect(result).toMatchObject({ scraped: false, refreshing: true, reason: "stale_refreshing" });
    expect(scrapeAllPlatforms).toHaveBeenCalledTimes(1); // started, not awaited
    expect(await settled(result.done)).toBe(false);

    finish();
    expect(await result.done).toBe(1); // the number saved, for a caller that must wait after all
  });

  it("still waits when nothing is stored: there is nothing to show yet", async () => {
    holding("missing");
    const finish = slowScrape();
    const pending = fetchAndRefreshListings("galaxy a17 new", { background: true });
    expect(await settled(pending)).toBe(false);
    finish();
    expect(await pending).toMatchObject({ scraped: true, saved: 1, reason: "stale_or_missing" });
  });

  it("waits for stale data too when not asked to refresh in the background (as before)", async () => {
    holding("stale");
    const finish = slowScrape();
    const pending = fetchAndRefreshListings("galaxy a17 wait");
    expect(await settled(pending)).toBe(false);
    finish();
    expect(await pending).toMatchObject({ scraped: true, reason: "stale_or_missing" });
  });

  it("waits for a forced refresh, even of stale data", async () => {
    holding("stale");
    const finish = slowScrape();
    const pending = fetchAndRefreshListings("galaxy a17 forced", { background: true, force: true });
    expect(await settled(pending)).toBe(false);
    finish();
    expect((await pending).scraped).toBe(true);
  });

  it("runs one scrape for searches that arrive while it is running", async () => {
    holding("stale");
    const finish = slowScrape();
    const first = await fetchAndRefreshListings("galaxy a17 twice", { background: true });
    const second = await fetchAndRefreshListings("Galaxy A17 Twice ", { background: true });

    expect(scrapeAllPlatforms).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ refreshing: true, reason: "joined_in_flight_background" });
    finish();
    expect(await first.done).toBe(1);
    expect(await second.done).toBe(1);
  });

  it("a background refresh that fails saves nothing and throws nowhere", async () => {
    holding("stale");
    vi.spyOn(Listing, "findOneAndUpdate").mockRejectedValue(new Error("database gone"));
    scrapeAllPlatforms.mockResolvedValue([{ platform: "priceoye", sourceUrl: "https://priceoye.pk/p/b", title: "Galaxy", price: 65000 }]);
    const result = await fetchAndRefreshListings("galaxy a17 failing", { background: true });
    expect(await result.done).toBe(0);
  });
});
