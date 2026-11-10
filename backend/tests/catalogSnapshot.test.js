// The catalog after a restart (2026-11-08): the first page saved before it answers at once, and the category is grouped again meanwhile.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../src/services/snapshot.service.js", async (original) => ({
  ...(await original()),
  readSnapshot: vi.fn(async () => null),
  writeSnapshot: vi.fn(async () => true),
}));
vi.mock("../src/services/historyEnrichment.service.js", () => ({ attachPriceHistory: async (listings) => listings }));

const { readSnapshot: readMock, writeSnapshot: writeMock } = await import("../src/services/snapshot.service.js");
const { default: Listing } = await import("../src/models/listing.model.js");
const { getCatalog, clearCatalogCache, SNAPSHOT_GROUPS } = await import("../src/services/catalogFeed.service.js");
const { closeGroupingPool } = await import("../src/services/grouping.service.js");
afterAll(() => closeGroupingPool());

describe("the catalog across a restart", () => {
  beforeEach(() => {
    clearCatalogCache();
    vi.mocked(readMock).mockReset().mockResolvedValue(null);
    vi.mocked(writeMock).mockClear();
  });

  it("answers a page the saved first page covers at once, and groups the category again in the background", async () => {
    const saved = { generatedAt: "2026-11-07T22:00:00.000Z", total: 900, groups: Array.from({ length: SNAPSHOT_GROUPS }, (_, i) => ({ productName: `P${i}`, offers: [] })) };
    vi.mocked(readMock).mockResolvedValue(saved);
    let release;
    const find = vi.spyOn(Listing, "find").mockImplementation(() => ({ lean: () => new Promise((resolve) => { release = () => resolve([]); }) }));

    const page = await getCatalog({ category: "smartphone", limit: 5 });
    expect(page).toEqual({ groups: saved.groups.slice(0, 5), total: 900, generatedAt: saved.generatedAt, brands: null }); // no brand counts from the saved page
    expect(find).toHaveBeenCalledTimes(1); // the regrouping has started
    release();
    find.mockRestore();
  });

  it("waits for the grouping when the page asked for is beyond the saved first page", async () => {
    vi.mocked(readMock).mockResolvedValue({ generatedAt: "x", total: 900, groups: [{ productName: "P0", offers: [] }] });
    const find = vi.spyOn(Listing, "find").mockImplementation(() => ({ lean: async () => [] }));
    const page = await getCatalog({ category: "smartphone", limit: 5, offset: 0 });
    expect(page.total).toBe(0); // computed, not the saved one
    find.mockRestore();
  });

  it("saves the first page of what it computed", async () => {
    const find = vi.spyOn(Listing, "find").mockImplementation(() => ({ lean: async () => [] }));
    await getCatalog({ category: "tv", limit: 5 });
    expect(writeMock).toHaveBeenCalledWith("catalog-tv", expect.objectContaining({ total: 0, groups: [], brands: [] })); // with its brand counts
    find.mockRestore();
  });

  it("answers one brand from that brand's listings alone before the category is grouped (2026-11-10: brand=apple never loaded)", async () => {
    vi.mocked(readMock).mockResolvedValue({ generatedAt: "x", total: 900, brands: [{ brand: "samsung", count: 364 }, { brand: "apple", count: 235 }], groups: [] });
    const listing = (id, title, brand) => ({ _id: id, title, brand, platform: "priceoye", price: 400000, productCategory: "smartphone" });
    let releaseWhole;
    const queries = [];
    const find = vi.spyOn(Listing, "find").mockImplementation((query) => {
      queries.push(query);
      if (!query.brand) return { lean: () => new Promise((resolve) => { releaseWhole = () => resolve([]); }) }; // the whole category: slow
      return { lean: async () => [listing("a1", "Apple iPhone 17 Pro Max 256GB", "apple"), listing("a2", "Apple iPhone 17 256GB", "apple")] };
    });

    const page = await getCatalog({ category: "smartphone", brand: "Apple", limit: 10 });
    expect(queries.some((q) => q.brand === "apple")).toBe(true);
    expect(page.total).toBe(2);
    expect(page.groups.map((g) => g.offers.length)).toEqual([1, 1]);
    expect(page.brands).toEqual([{ brand: "samsung", count: 364 }, { brand: "apple", count: 235 }]); // the filter still lists every brand
    expect(queries.some((q) => !q.brand)).toBe(true); // and the whole category is being grouped meanwhile
    releaseWhole();
    find.mockRestore();
  });
});
