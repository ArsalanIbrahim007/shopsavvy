// The catalogue refresh (2026-11-08): whole store catalogues instead of one search per product, so the prices we hold stay fresh.
// AlfaMall, 42% of our listings, was only 30% up to date within a day when it was refreshed by searching.
import { describe, it, expect, vi } from "vitest";

import { shopifyCatalogue, shopifyListing, storefrontCatalogue, wooCatalogue, STOREFRONT_PER_PAGE } from "../src/scrapers/catalogue.js";
import { refreshCatalogue, storefrontTerms } from "../src/services/catalogueRefresh.service.js";
import { withoutRefreshedStores } from "../src/services/scheduledScraping.service.js";

const collect = async (pages) => {
  const out = [];
  for await (const page of pages) out.push(page);
  return out;
};

const SHOP = { platform: "mistore", type: "shopify", baseUrl: "https://mistore.pk" };
const product = (handle, variants, over = {}) => ({ title: `Xiaomi ${handle}`, handle, variants, images: [{ src: "//cdn.shopify.com/a.jpg" }], ...over });

describe("shopifyListing", () => {
  it("lists a product at its lowest variant price, at the address the search adapter uses, with its 'was' price", () => {
    const listing = shopifyListing(SHOP, product("redmi-15c", [
      { price: "32999.00", compare_at_price: "35999.00", available: false },
      { price: "29999.00", compare_at_price: "33999.00", available: true },
    ]));
    expect(listing).toMatchObject({ platform: "mistore", sourceUrl: "https://mistore.pk/products/redmi-15c", price: 29999, originalPrice: 33999, inStock: true, imageUrl: "https://cdn.shopify.com/a.jpg" });
  });

  it("skips a product without a price or with an unsafe handle, and marks one with nothing available as out of stock", () => {
    expect(shopifyListing(SHOP, product("no-price", [{ price: "0.00" }]))).toBeNull();
    expect(shopifyListing(SHOP, product("bad/handle", [{ price: "100.00" }]))).toBeNull();
    expect(shopifyListing(SHOP, product("gone", [{ price: "500.00", available: false }])).inStock).toBe(false);
  });
});

describe("the catalogue readers", () => {
  it("pages through a Shopify store until a short page", async () => {
    const pages = [Array.from({ length: 250 }, (_, i) => product(`p${i}`, [{ price: "1000.00" }])), [product("last", [{ price: "2000.00" }])]];
    const fetchJson = vi.fn(async (url) => ({ products: pages[Number(new URL(url).searchParams.get("page")) - 1] ?? [] }));
    const result = await collect(shopifyCatalogue(SHOP, { fetchJson }));
    expect(result.map((p) => p.length)).toEqual([250, 1]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson.mock.calls[0][0]).toBe("https://mistore.pk/products.json?limit=250&page=1");
  });

  it("keeps the pages read when Shopify stops answering after its 100-page limit (Al-Fatah, 2026-11-08)", async () => {
    const errors = [];
    const fetchJson = vi.fn(async (url) => {
      if (new URL(url).searchParams.get("page") === "2") throw new Error("HTTP 400");
      return { products: Array.from({ length: 250 }, (_, i) => product(`p${i}`, [{ price: "1000.00" }])) };
    });
    const pages = await collect(shopifyCatalogue(SHOP, { fetchJson, onError: (e) => errors.push(e) }));
    expect(pages.map((p) => p.length)).toEqual([250]);
    expect(errors).toHaveLength(1);
  });

  it("skips a storefront brand whose search fails, and fails only when every brand does", async () => {
    const STORE = { platform: "alfamall", type: "storefront", baseUrl: "https://alfamall.com", apiUrl: "https://api.example/search", params: {}, productPath: "/" };
    const ok = { count: 1, results: [{ title: "Apple iPhone 17", handle: "apple-iphone-17", variant_detail: { discounted_price: 300000 }, images: [] }] };
    const errors = [];
    const fetchJson = async (url) => {
      const q = new URL(url).searchParams.get("q");
      if (q === "slow") throw new Error("timeout of 15000ms exceeded");
      if (q === "odd") return { message: "busy" };
      return ok;
    };
    const pages = await collect(storefrontCatalogue(STORE, ["slow", "apple", "odd"], { fetchJson, onError: (e) => errors.push(e.term) }));
    expect(pages.flat().map((l) => l.title)).toEqual(["Apple iPhone 17"]);
    expect(errors).toEqual(["slow", "odd"]);
    await expect(collect(storefrontCatalogue(STORE, ["slow", "odd"], { fetchJson }))).rejects.toThrow(/every search failed/);
  });

  it("refuses an answer that is not a catalogue", async () => {
    await expect(collect(shopifyCatalogue(SHOP, { fetchJson: async () => ({ error: "nope" }) }))).rejects.toThrow(/unexpected catalogue response/);
  });

  it("reads a WooCommerce product's variations only when we hold some of them, one listing per capacity", async () => {
    const WOO = { platform: "techroid", type: "woocommerce", baseUrl: "https://techroid.com" };
    const parent = { id: 7, name: "Redmi Note 15", type: "variable", permalink: "https://techroid.com/product/redmi-note-15/", prices: { price: "6000000", currency_minor_unit: 2 } };
    const simple = { id: 8, name: "Cable", type: "simple", permalink: "https://techroid.com/product/cable/", prices: { price: "50000", currency_minor_unit: 2 } };
    // the Store API's shape: the chosen options as one "Name: value" string
    const variation = (id, storage, price) => ({ id, name: "Redmi Note 15", variation: `Storage: ${storage}`, prices: { price: String(price * 100), currency_minor_unit: 2 }, images: [] });
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? [variation(71, "128GB", 60000), variation(72, "256GB", 66000)] : [parent, simple]));
    const [page] = await collect(wooCatalogue(WOO, { fetchJson, expand: (permalink) => permalink === parent.permalink }));
    expect(page.map((l) => [l.title, l.price])).toEqual([["Redmi Note 15 128GB", 60000], ["Redmi Note 15 256GB", 66000], ["Cable", 500]]);
    expect(page[0].sourceUrl).toContain("?attribute_storage=128GB");
    expect(fetchJson.mock.calls.filter(([u]) => u.includes("type=variation"))).toHaveLength(1);
  });

  it("reads a storefront marketplace one brand at a time, stopping at the count it reports", async () => {
    const STORE = { platform: "digimall", type: "storefront", baseUrl: "https://digimall.faysalbank.com", apiUrl: "https://api.example/search", params: { storefront: "23" }, productPath: "/product/" };
    const item = (i) => ({ title: `Samsung item ${i}`, handle: `samsung-${i}`, variant_detail: { discounted_price: 1000 + i }, images: [] });
    const fetchJson = vi.fn(async (url) => {
      const q = new URL(url).searchParams;
      const page = Number(q.get("page"));
      if (q.get("q") === "samsung") return { count: 50, results: page === 1 ? Array.from({ length: STOREFRONT_PER_PAGE }, (_, i) => item(i)) : Array.from({ length: 10 }, (_, i) => item(40 + i)) };
      return { count: 0, results: [] };
    });
    const pages = await collect(storefrontCatalogue(STORE, ["samsung", "nothing"], { fetchJson }));
    expect(pages.flat()).toHaveLength(50);
    expect(fetchJson).toHaveBeenCalledTimes(3); // two pages of "samsung", one empty page of "nothing"
  });
});

// A stand-in for the Listing and PriceHistory models: what was held, and what was written.
function fakeModels(held) {
  const listing = {
    find: vi.fn(() => ({ lean: async () => held.map((sourceUrl) => ({ sourceUrl, title: sourceUrl })) })),
    bulkWrite: vi.fn(async () => ({})),
  };
  const priceHistory = { recordPrices: vi.fn(async (items) => ({ appended: items.length, created: 0 })) };
  return { listing, priceHistory };
}

describe("refreshCatalogue", () => {
  const listingFor = (handle, price) => ({ platform: "mistore", sourceUrl: `https://mistore.pk/products/${handle}`, title: handle, price, originalPrice: null, inStock: true });
  const shopifyPage = (...listings) => listings.map((l) => product(l.sourceUrl.split("/").pop(), [{ price: `${l.price}.00` }], { title: l.title }));

  it("updates only the listings we hold, writes each once, and records their price history", async () => {
    const { listing, priceHistory } = fakeModels(["https://mistore.pk/products/held-a", "https://mistore.pk/products/held-b"]);
    const fetchJson = async () => ({ products: shopifyPage(listingFor("held-a", 1000), listingFor("new-c", 2000), listingFor("held-b", 3000), listingFor("held-a", 1000)) });
    const stats = await refreshCatalogue(SHOP, { fetchJson, listing, priceHistory });
    expect(stats).toMatchObject({ known: 2, items: 3, matched: 2, updated: 2, historyAppended: 2 });
    const ops = listing.bulkWrite.mock.calls[0][0];
    expect(ops.map((op) => op.updateOne.filter.sourceUrl)).toEqual(["https://mistore.pk/products/held-a", "https://mistore.pk/products/held-b"]);
    expect(ops[0].updateOne.update.$set).toMatchObject({ price: 1000, isActive: true });
    expect(ops[0].updateOne.update.$set.lastScrapedAt).toBeInstanceOf(Date);
    expect(ops.every((op) => !op.updateOne.upsert)).toBe(true); // never adds a listing
    expect(priceHistory.recordPrices.mock.calls[0][0]).toHaveLength(2);
  });

  it("marks out of stock what a complete catalogue no longer lists, and never after a broken read", async () => {
    const held = ["https://mistore.pk/products/held-a", "https://mistore.pk/products/held-b", "https://mistore.pk/products/gone-c"];
    const models = fakeModels(held);
    models.listing.updateMany = vi.fn(async () => ({}));
    const fetchJson = async () => ({ products: shopifyPage(listingFor("held-a", 1000), listingFor("held-b", 3000)) });
    const stats = await refreshCatalogue(SHOP, { fetchJson, ...models });
    expect(stats.gone).toBe(1);
    const [filter, update] = models.listing.updateMany.mock.calls[0];
    expect(filter.sourceUrl.$in).toEqual(["https://mistore.pk/products/gone-c"]);
    expect(update.$set.inStock).toBe(false);

    // the first page fails: nothing is marked
    const broken = fakeModels(held);
    broken.listing.updateMany = vi.fn();
    await expect(refreshCatalogue(SHOP, { fetchJson: async () => { throw new Error("HTTP 503"); }, ...broken })).rejects.toThrow();
    expect(broken.listing.updateMany).not.toHaveBeenCalled();

    // most of our listings missing (a read gone wrong): nothing is marked
    const sparse = fakeModels([...held, ...Array.from({ length: 10 }, (_, i) => `https://mistore.pk/products/x${i}`)]);
    sparse.listing.updateMany = vi.fn();
    const few = await refreshCatalogue(SHOP, { fetchJson, ...sparse });
    expect(few.gone).toBe(0);
    expect(sparse.listing.updateMany).not.toHaveBeenCalled();
  });

  it("skips an implausible price, and writes nothing on a dry run", async () => {
    const { listing, priceHistory } = fakeModels(["https://mistore.pk/products/held-a", "https://mistore.pk/products/held-b"]);
    const fetchJson = async () => ({ products: shopifyPage(listingFor("held-a", 5), listingFor("held-b", 3000)) });
    const stats = await refreshCatalogue(SHOP, { fetchJson, listing, priceHistory, dryRun: true });
    expect(stats).toMatchObject({ matched: 2, skippedPrice: 1, updated: 1 });
    expect(listing.bulkWrite).not.toHaveBeenCalled();
    expect(priceHistory.recordPrices).not.toHaveBeenCalled();
  });
});

describe("storefrontTerms", () => {
  it("reads a marketplace by the first words of the titles we hold there, the most common first, ignoring one-offs", async () => {
    const titles = ["Samsung A17", "Samsung A57", "Samsung TV", "Apple iPhone 17", "Apple iPhone 16", "Apple Watch", "Apple AirPods", "Oddity Thing"];
    const listing = { find: () => ({ lean: async () => titles.map((title) => ({ title })) }) };
    expect(await storefrontTerms("alfamall", { listing })).toEqual(["apple", "samsung"]);
  });
});

describe("withoutRefreshedStores", () => {
  it("drops the stores refreshed from their catalogue from the searches, and an entry left with no store", () => {
    const plan = [
      { query: "galaxy a17", platforms: ["priceoye", "alfamall", "mega"] },
      { query: "redmi buds", platforms: ["alfamall", "digimall"] },
      { query: "new phone" }, // every store: discovery stays
    ];
    expect(withoutRefreshedStores(plan, new Set(["alfamall", "digimall"]))).toEqual([
      { query: "galaxy a17", platforms: ["priceoye", "mega"] },
      { query: "new phone" },
    ]);
    expect(withoutRefreshedStores(plan, new Set())).toBe(plan);
  });
});
