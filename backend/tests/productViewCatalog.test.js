// A product page shows the product its catalog card showed (Fable's checks, 2026-11-12): "26 offers from 9 stores" on the card had
// become "4 offers from 1 store" on the page, which regrouped nearby listings on its own.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/historyEnrichment.service.js", () => ({ attachPriceHistory: async (listings) => listings.map((l) => ({ ...l, priceHistory: [] })) }));
vi.mock("../src/services/snapshot.service.js", async (original) => ({ ...(await original()), readSnapshot: vi.fn(async () => null), writeSnapshot: vi.fn(async () => true) }));

const { buildProductView } = await import("../src/services/productView.service.js");
const { catalogGroupOf, clearCatalogCache } = await import("../src/services/catalogFeed.service.js");
const { readSnapshot } = await import("../src/services/snapshot.service.js");

const offer = (id, platform, price) => ({ _id: id, platform, title: "Xiaomi Redmi Note 15 8GB 256GB", price, productCategory: "smartphone" });
const product = { productName: "Xiaomi Redmi Note 15 8GB 256GB", offers: [offer("a1", "priceoye", 75999), offer("a2", "shophive", 75499), offer("a3", "alfamall", 74739)] };

beforeEach(() => clearCatalogCache());

describe("the product page uses the catalog's product", () => {
  it("returns the catalog's product with all its offers when the catalog holds the listing", async () => {
    const view = await buildProductView(offer("a2", "shophive", 75499), { catalogGroupOf: async () => product });
    expect(view.offers.map((o) => o._id)).toEqual(["a1", "a2", "a3"]);
    expect(view.selectedListing._id).toBe("a2");
    expect(view.selectedGroup.productName).toBe(product.productName);
  });

  it("before the catalog is computed after a start, finds the product in the saved first page the cards come from", async () => {
    vi.mocked(readSnapshot).mockResolvedValue({ generatedAt: "x", total: 1, groups: [product] });
    expect(await catalogGroupOf("smartphone", "a3")).toBe(product);
    expect(await catalogGroupOf("smartphone", "zz")).toBeNull();
    expect(await catalogGroupOf("not-a-category", "a3")).toBeNull();
  });
});
