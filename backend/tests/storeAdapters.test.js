import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";
import { MIN_GAP_MS, USER_AGENT, fetchJson, waitForTurn } from "../src/scrapers/politeJson.js";
import { scrapeShopifySearch } from "../src/scrapers/shopify.scraper.js";
import { scrapeWooSearch, searchTerm } from "../src/scrapers/woocommerce.scraper.js";
import { STORES, storeTasks } from "../src/scrapers/stores.js";
import { PLATFORM_TRUST_SCORES, DEFAULT_TRUST } from "../src/ranking/scores/trustScore.js";

// Shapes below are trimmed from the real responses read on 2026-10-01.
const SHOP = { platform: "mistore", baseUrl: "https://mistore.pk" };
const shopifyProduct = (over = {}) => ({
  available: true, compare_at_price_max: "0.00", compare_at_price_min: "0.00", handle: "redmi-note-14-pro-8gb-256gb", id: 1,
  image: "https://cdn.shopify.com/s/files/1/0231/files/RedmiNote14Pro.jpg?v=1", price: "82999.00", price_max: "82999.00", price_min: "82999.00",
  title: "Redmi Note 14 Pro (8GB- 256GB)", type: "Phone", url: "/products/redmi-note-14-pro-8gb-256gb?_pos=1&_sid=abc&_ss=r", vendor: "MiStore.pk", ...over,
});
const shopifyResponse = (...products) => ({ resources: { results: { products } } });

const WOO = { platform: "xcessorieshub", baseUrl: "https://xcessorieshub.com" };
const prices = (price, over = {}) => ({ price: String(price), regular_price: String(price), sale_price: String(price), price_range: null, currency_code: "PKR", currency_minor_unit: 0, ...over });
const wooProduct = (over = {}) => ({
  id: 1, name: "Samsung Galaxy A17", type: "simple", permalink: "https://xcessorieshub.com/product/samsung-galaxy-a17/", prices: prices(66990),
  is_in_stock: true, average_rating: "0", review_count: 0, images: [{ src: "https://xcessorieshub.com/wp-content/uploads/a17.jpg" }], ...over,
});
const variation = (id, storage, colour, price, over = {}) => ({
  id, name: "Apple iPhone 17 Pro Max PTA Approved", type: "variation", parent: 155180, variation: `Storage: ${storage}, Color: ${colour}`,
  permalink: `https://xcessorieshub.com/product/apple-iphone-17-pro-max-pta-approved/?attribute_color=${colour}&attribute_storage=${storage}`,
  prices: prices(price), is_in_stock: true, images: [], ...over,
});
const iphoneVariations = () => {
  const out = [];
  let id = 100;
  for (const [storage, price] of [["2 TB", 898499], ["1 TB", 731999], ["512 GB", 569999], ["256 GB", 479999]]) {
    for (const colour of ["Silver", "Cosmic Orange", "Deep Blue"]) out.push(variation(id++, storage, colour, price));
  }
  return out;
};

// What a promise rejected with, for tests that check the message (a rejection made by a mock is easier to catch than to match).
const rejection = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
};

describe("politeJson", () => {
  it("lets the first request to a store go at once and spaces the next ones by the gap, in the order they asked", async () => {
    let clock = 10_000;
    const sleeps = [];
    const opts = { gapMs: 1500, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; } };
    await waitForTurn("one.example", opts);
    await waitForTurn("one.example", opts);
    await waitForTurn("one.example", opts);
    expect(sleeps).toEqual([1500, 1500]);
  });

  it("does not make one store wait for another", async () => {
    let clock = 50_000;
    const sleeps = [];
    const opts = { gapMs: 1500, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; } };
    await waitForTurn("a.example", opts);
    await waitForTurn("b.example", opts);
    expect(sleeps).toEqual([]);
  });

  it("claims its turn before waiting, so requests that arrive together queue up instead of all going at once", async () => {
    let clock = 90_000;
    const sleeps = [];
    const opts = { gapMs: 1000, now: () => clock, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } }; // time does not move
    await Promise.all([waitForTurn("c.example", opts), waitForTurn("c.example", opts), waitForTurn("c.example", opts)]);
    expect(sleeps).toEqual([1000, 2000]);
  });

  describe("fetchJson", () => {
    beforeEach(() => { vi.mocked(axios.get).mockReset(); }); // braces: a hook that returns a function has it run as teardown

    it("identifies itself honestly, asks for JSON, and returns the body", async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: [{ ok: true }] });
      expect(await fetchJson("https://fresh-host-1.example/x")).toEqual([{ ok: true }]);
      const [url, config] = vi.mocked(axios.get).mock.calls[0];
      expect(url).toBe("https://fresh-host-1.example/x");
      expect(config.headers["User-Agent"]).toBe(USER_AGENT);
      expect(config.headers["User-Agent"]).toMatch(/ShopSavvyBot/);
      expect(config.headers.Accept).toBe("application/json");
      expect(config.timeout).toBeLessThanOrEqual(20000);
      expect(config.validateStatus(200)).toBe(true); // only a success counts; a 403 or 429 is an answer, never retried
      expect(config.validateStatus(403)).toBe(false);
      expect(config.validateStatus(429)).toBe(false);
    });

    it("reports a refusal with the store and the status, and does not retry it", async () => {
      vi.mocked(axios.get).mockImplementation(async () => { throw Object.assign(new Error("Request failed"), { response: { status: 403 } }); });
      expect((await rejection(fetchJson("https://fresh-host-2.example/x"))).message).toBe("fresh-host-2.example: HTTP 403");
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("reports a network failure by its message", async () => {
      vi.mocked(axios.get).mockImplementation(async () => { throw new Error("timeout of 15000ms exceeded"); });
      expect((await rejection(fetchJson("https://fresh-host-3.example/x"))).message).toBe("fresh-host-3.example: timeout of 15000ms exceeded");
    });

    it("uses a gap of at least a second between requests to a store", () => {
      expect(MIN_GAP_MS).toBeGreaterThanOrEqual(1000);
    });
  });
});

describe("scrapeShopifySearch", () => {
  it("asks the store's own search-suggestion endpoint for products, with the search encoded", async () => {
    const fetchJson = vi.fn(async () => shopifyResponse());
    await scrapeShopifySearch(SHOP, "redmi note 14 & more", { fetchJson });
    expect(fetchJson).toHaveBeenCalledWith("https://mistore.pk/search/suggest.json?q=redmi%20note%2014%20%26%20more&resources%5Btype%5D=product&resources%5Blimit%5D=10");
  });

  it("turns a product into a listing: clean address without tracking parameters, price, picture, stock", async () => {
    const [listing] = await scrapeShopifySearch(SHOP, "redmi", { fetchJson: async () => shopifyResponse(shopifyProduct()) });
    expect(listing).toMatchObject({
      platform: "mistore", sourceUrl: "https://mistore.pk/products/redmi-note-14-pro-8gb-256gb", title: "Redmi Note 14 Pro (8GB- 256GB)",
      price: 82999, originalPrice: null, imageUrl: "https://cdn.shopify.com/s/files/1/0231/files/RedmiNote14Pro.jpg?v=1", inStock: true,
    });
  });

  it("reads a was-price only when it is above the price, and marks an unavailable product out of stock", async () => {
    const out = await scrapeShopifySearch(SHOP, "x", { fetchJson: async () => shopifyResponse(
      shopifyProduct({ id: 1, price: "75499.00", compare_at_price_max: "79999.00" }),
      shopifyProduct({ id: 2, url: "/products/b", price: "100.00", compare_at_price_max: "100.00" }),
      shopifyProduct({ id: 3, url: "/products/c", available: false }),
    ) });
    expect(out.map((l) => [l.price, l.originalPrice, l.inStock])).toEqual([[75499, 79999, true], [100, null, true], [82999, null, false]]);
  });

  it("makes protocol-relative and path-only picture addresses absolute", async () => {
    const out = await scrapeShopifySearch(SHOP, "x", { fetchJson: async () => shopifyResponse(
      shopifyProduct({ url: "/products/a", image: "//cdn.example/a.jpg" }),
      shopifyProduct({ url: "/products/b", image: "/cdn/b.jpg" }),
      shopifyProduct({ url: "/products/c", image: null }),
    ) });
    expect(out.map((l) => l.imageUrl)).toEqual(["https://cdn.example/a.jpg", "https://mistore.pk/cdn/b.jpg", null]);
  });

  it("leaves out a product with no price, no name or no address, without failing the others", async () => {
    const out = await scrapeShopifySearch(SHOP, "x", { fetchJson: async () => shopifyResponse(
      shopifyProduct({ id: 1, url: "/products/a", price: "0.00" }),
      shopifyProduct({ id: 2, url: "/products/b", title: "" }),
      shopifyProduct({ id: 3, url: "" }),
      shopifyProduct({ id: 4, url: "/products/d" }),
    ) });
    expect(out.map((l) => l.sourceUrl)).toEqual(["https://mistore.pk/products/d"]);
  });

  it("gives nothing for a search with no products, and an error for an answer that is not a product search", async () => {
    expect(await scrapeShopifySearch(SHOP, "x", { fetchJson: async () => shopifyResponse() })).toEqual([]);
    await expect(scrapeShopifySearch(SHOP, "x", { fetchJson: async () => ({ nope: true }) })).rejects.toThrow("mistore: unexpected search response");
  });

  it("passes a failed request on, so the scraper run records the store as failed", async () => {
    await expect(scrapeShopifySearch(SHOP, "x", { fetchJson: async () => { throw new Error("mistore.pk: HTTP 429"); } })).rejects.toThrow("HTTP 429");
  });
});

describe("searchTerm", () => {
  it("drops words that only name a kind of product, keeps the rest, and never returns nothing", () => {
    expect(searchTerm("samsung tv")).toBe("samsung");
    expect(searchTerm("Dell laptop")).toBe("Dell");
    expect(searchTerm("iphone 17 pro max")).toBe("iphone 17 pro max");
    expect(searchTerm("laptop")).toBe("laptop");
    expect(searchTerm("  ")).toBe("");
  });
});

describe("scrapeWooSearch", () => {
  const calls = (fetchJson) => fetchJson.mock.calls.map(([url]) => url.replace(WOO.baseUrl + "/wp-json/wc/store/v1/", ""));

  it("asks the store's own product search, with the search encoded and a wide first page", async () => {
    const fetchJson = vi.fn(async () => []);
    await scrapeWooSearch(WOO, "samsung galaxy a17", { fetchJson });
    expect(calls(fetchJson)).toEqual(["products?search=samsung%20galaxy%20a17&per_page=50&page=1"]);
  });

  it("turns a simple product into a listing: price in whole rupees, was-price, picture, stock, rating", async () => {
    const [listing] = await scrapeWooSearch(WOO, "samsung", { fetchJson: async () => [wooProduct({
      prices: prices(66990, { regular_price: "69990" }), average_rating: "4.6", review_count: 12, is_in_stock: false,
    })] });
    expect(listing).toMatchObject({
      platform: "xcessorieshub", sourceUrl: "https://xcessorieshub.com/product/samsung-galaxy-a17/", title: "Samsung Galaxy A17", price: 66990, originalPrice: 69990,
      imageUrl: "https://xcessorieshub.com/wp-content/uploads/a17.jpg", inStock: false, rating: 4.6, reviewCount: 12,
    });
  });

  it("treats a zero rating as no rating, and ignores a was-price that is not above the price", async () => {
    const [listing] = await scrapeWooSearch(WOO, "samsung", { fetchJson: async () => [wooProduct({ average_rating: "0", review_count: 0, prices: prices(100, { regular_price: "100" }) })] });
    expect(listing.rating).toBeNull();
    expect(listing.reviewCount).toBeNull();
    expect(listing.originalPrice).toBeNull();
  });

  it("decodes the HTML escapes in titles (inch marks, ampersands)", async () => {
    const [a, b] = await scrapeWooSearch(WOO, "samsung", { fetchJson: async () => [
      wooProduct({ id: 1, name: "43&#8243; Samsung Crystal UHD 4K Smart TV", permalink: "https://x.example/a" }),
      wooProduct({ id: 2, name: "Samsung Cases &amp; Covers", permalink: "https://x.example/b" }),
    ] });
    expect(a.title).toBe("43″ Samsung Crystal UHD 4K Smart TV");
    expect(b.title).toBe("Samsung Cases & Covers");
  });

  it("uses the minor unit the store says (paisa) and skips a product with no price", async () => {
    const out = await scrapeWooSearch(WOO, "samsung", { fetchJson: async () => [
      wooProduct({ id: 1, permalink: "https://x.example/a", prices: prices(6699000, { currency_minor_unit: 2 }) }),
      wooProduct({ id: 2, permalink: "https://x.example/b", prices: prices(0) }),
      wooProduct({ id: 3, permalink: "https://x.example/c", prices: prices("") }),
    ] });
    expect(out.map((l) => l.price)).toEqual([66990]);
  });

  it("expands a variable product into one listing per capacity, folding the colours into it", async () => {
    const parent = wooProduct({ id: 155180, name: "Apple iPhone 17 Pro Max PTA Approved", type: "variable", permalink: "https://xcessorieshub.com/product/apple-iphone-17-pro-max-pta-approved/", prices: prices(479999, { price_range: { min_amount: "479999", max_amount: "898499" } }) });
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? iphoneVariations() : [parent]));
    const out = await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson });

    expect(calls(fetchJson)).toContain("products?type=variation&parent=155180&per_page=50");
    expect(out.map((l) => [l.title, l.price])).toEqual([
      ["Apple iPhone 17 Pro Max PTA Approved 2TB", 898499], ["Apple iPhone 17 Pro Max PTA Approved 1TB", 731999],
      ["Apple iPhone 17 Pro Max PTA Approved 512GB", 569999], ["Apple iPhone 17 Pro Max PTA Approved 256GB", 479999],
    ]);
    expect(out[3].sourceUrl).toBe("https://xcessorieshub.com/product/apple-iphone-17-pro-max-pta-approved/?attribute_storage=256GB"); // no colour in the address
  });

  it("keeps a colour that costs more as its own listing", async () => {
    const parent = wooProduct({ id: 9, name: "Apple iPhone 16 PTA Approved", type: "variable", permalink: "https://x.example/p/" });
    const variations = [
      variation(1, "128 GB", "Black", 299999, { name: "Apple iPhone 16 PTA Approved" }),
      variation(2, "128 GB", "White", 299999, { name: "Apple iPhone 16 PTA Approved" }),
      variation(3, "128 GB", "Teal", 308999, { name: "Apple iPhone 16 PTA Approved" }),
    ];
    const out = await scrapeWooSearch(WOO, "iphone 16", { fetchJson: async (url) => (url.includes("type=variation") ? variations : [parent]) });
    expect(out.map((l) => l.price).sort()).toEqual([299999, 308999]);
  });

  it("keeps the variations one by one, colour in the title, when there is no capacity or other option to tell them apart", async () => {
    const parent = wooProduct({ id: 7, name: "Samsung Galaxy Watch 9", type: "variable", permalink: "https://x.example/w/" });
    const variations = ["Silver", "Black"].map((colour, i) => ({ ...variation(i, "x", colour, 95499), name: "Samsung Galaxy Watch 9", variation: `Color: ${colour}`, permalink: `https://x.example/w/?attribute_color=${colour}` }));
    const out = await scrapeWooSearch(WOO, "samsung galaxy watch", { fetchJson: async (url) => (url.includes("type=variation") ? variations : [parent]) });
    expect(out.map((l) => l.title)).toEqual(["Samsung Galaxy Watch 9 Silver", "Samsung Galaxy Watch 9 Black"]);
  });

  it("does not spend its few expansions on the accessories made for the product, and expands the closest name first", async () => {
    const products = [
      wooProduct({ id: 1, name: "YOUKSH Transparent Case for iPhone 17 Pro Max", type: "variable", permalink: "https://x.example/1" }),
      wooProduct({ id: 2, name: "Youksh iPhone 17 Pro Max Lens Protector", type: "variable", permalink: "https://x.example/2" }),
      wooProduct({ id: 3, name: "iPhone 17 Pro Max Premium Liquid Silicone Wallet Something", type: "variable", permalink: "https://x.example/3" }),
      wooProduct({ id: 4, name: "Apple iPhone 17 Pro Max", type: "variable", permalink: "https://x.example/4" }),
    ];
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? [] : products));
    await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson });
    const expanded = calls(fetchJson).filter((c) => c.includes("type=variation")).map((c) => c.match(/parent=(\d+)/)[1]);
    expect(expanded.sort()).toEqual(["3", "4"]); // the phone, and never the ones with "Case for" or "Protector"
  });

  it("when more products qualify than may be expanded, the ones whose names are closest to the search win", async () => {
    const products = [
      wooProduct({ id: 1, name: "Samsung Galaxy S25 Ultra PTA Approved Titanium Black 12GB 512GB Dual Sim", type: "variable", permalink: "https://x.example/1" }),
      wooProduct({ id: 2, name: "Samsung Galaxy S25 Ultra Bundle Edition With Free Gifts And Extras", type: "variable", permalink: "https://x.example/2" }),
      wooProduct({ id: 3, name: "Samsung Galaxy S25 Ultra", type: "variable", permalink: "https://x.example/3" }),
      wooProduct({ id: 4, name: "Samsung Galaxy S25 Ultra PTA", type: "variable", permalink: "https://x.example/4" }),
      wooProduct({ id: 5, name: "Samsung Galaxy S25 Ultra 5G", type: "variable", permalink: "https://x.example/5" }),
    ];
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? [] : products));
    await scrapeWooSearch(WOO, "samsung galaxy s25 ultra", { fetchJson });
    const expanded = calls(fetchJson).filter((c) => c.includes("type=variation")).map((c) => c.match(/parent=(\d+)/)[1]);
    expect(expanded.sort()).toEqual(["3", "4", "5"]);
  });

  it("does not expand a variable product that is not what was searched for", async () => {
    const products = [
      wooProduct({ id: 1, name: "Samsung Galaxy Watch 9", type: "variable", permalink: "https://x.example/1" }),
      wooProduct({ id: 2, name: "Apple iPhone 17 Pro Max", type: "variable", permalink: "https://x.example/2" }),
    ];
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? [] : products));
    await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson });
    expect(calls(fetchJson).filter((c) => c.includes("type=variation"))).toEqual(["products?type=variation&parent=2&per_page=50"]);
  });

  it("expands at most three variable products", async () => {
    const products = Array.from({ length: 6 }, (_, i) => wooProduct({ id: i + 1, name: `Samsung Galaxy S2${i} Ultra`, type: "variable", permalink: `https://x.example/${i}` }));
    const fetchJson = vi.fn(async (url) => (url.includes("type=variation") ? [] : products));
    await scrapeWooSearch(WOO, "samsung galaxy", { fetchJson });
    expect(calls(fetchJson).filter((c) => c.includes("type=variation"))).toHaveLength(3);
  });

  it("falls back to the product's own (lowest) price when its variations cannot be read or are empty", async () => {
    const parent = wooProduct({ id: 5, name: "Apple iPhone 17 Pro Max", type: "variable", permalink: "https://x.example/5", prices: prices(479999, { price_range: { min_amount: "479999", max_amount: "898499" } }) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson: async (url) => { if (url.includes("type=variation")) throw new Error("x: HTTP 500"); return [parent]; } });
    expect(failing.map((l) => [l.title, l.price])).toEqual([["Apple iPhone 17 Pro Max", 479999]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not read the variations"));
    const empty = await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson: async (url) => (url.includes("type=variation") ? [] : [parent]) });
    expect(empty).toHaveLength(1);
    warn.mockRestore();
  });

  it("reads a second page only while it has found fewer than two real products (not accessories)", async () => {
    const accessory = (i) => wooProduct({ id: 100 + i, name: `Youksh Case for iPhone 17 Pro Max ${i}`, permalink: `https://x.example/c${i}` });
    const page1 = Array.from({ length: 50 }, (_, i) => accessory(i));
    const phone = wooProduct({ id: 1, name: "Apple iPhone 17 Pro Max", permalink: "https://x.example/phone" });
    const phone2 = wooProduct({ id: 2, name: "Apple iPhone 17 Pro Max 2", permalink: "https://x.example/phone2" });

    const needsSecond = vi.fn(async (url) => (url.endsWith("page=1") ? page1 : [phone, phone2]));
    const out = await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson: needsSecond });
    expect(calls(needsSecond).filter((c) => c.startsWith("products?search"))).toHaveLength(2);
    expect(out.some((l) => l.title === "Apple iPhone 17 Pro Max")).toBe(true);

    const enough = vi.fn(async () => [phone, phone2, ...page1.slice(0, 48)]); // a full page that already holds two phones
    await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson: enough });
    expect(enough).toHaveBeenCalledTimes(1);

    const shortPage = vi.fn(async () => [accessory(1)]); // the last page: nothing more to read
    await scrapeWooSearch(WOO, "iphone 17 pro max", { fetchJson: shortPage });
    expect(shortPage).toHaveBeenCalledTimes(1);
  });

  it("never reads more than three pages, and keeps what it has when a later page fails", async () => {
    const accessory = (i) => wooProduct({ id: i, name: `Youksh Case for iPhone ${i}`, permalink: `https://x.example/c${i}` });
    const always = vi.fn(async () => Array.from({ length: 50 }, (_, i) => accessory(i)));
    await scrapeWooSearch(WOO, "iphone 17", { fetchJson: always });
    expect(always).toHaveBeenCalledTimes(3);

    let n = 0;
    const failsLater = vi.fn(async () => { if (++n === 2) return { code: "rest_no_route" }; return Array.from({ length: 50 }, (_, i) => accessory(i)); });
    const out = await scrapeWooSearch(WOO, "iphone 17", { fetchJson: failsLater });
    expect(out).toHaveLength(50);
  });

  it("reports an answer that is not a product list on the first page as an error", async () => {
    await expect(scrapeWooSearch(WOO, "x", { fetchJson: async () => ({ code: "rest_no_route" }) })).rejects.toThrow("xcessorieshub: unexpected search response");
  });
});

describe("the store list", () => {
  it("has a platform id, a type the adapters know and an https address for every store, each once", () => {
    const ids = STORES.map((s) => s.platform);
    expect(new Set(ids).size).toBe(ids.length);
    for (const store of STORES) {
      expect(["shopify", "woocommerce"]).toContain(store.type);
      expect(store.baseUrl).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      expect(store.platform).toMatch(/^[a-z0-9]+$/);
    }
    expect(ids).toEqual(["mistore", "mymart", "alfatah", "xcessorieshub", "eezepc", "ledshop"]);
  });

  it("gives every store a trust value of its own rather than the default", () => {
    for (const store of STORES) {
      expect(PLATFORM_TRUST_SCORES[store.platform], store.platform).toBeDefined();
      expect(PLATFORM_TRUST_SCORES[store.platform]).not.toBe(DEFAULT_TRUST);
      expect(PLATFORM_TRUST_SCORES[store.platform]).toBeLessThanOrEqual(0.9);
    }
  });

  it("makes one task per store, in the shape the scraper run uses, each asking its own address", async () => {
    const asked = [];
    const tasks = storeTasks("iphone 17", { fetchJson: async (url) => { asked.push(url); return url.includes("suggest.json") ? shopifyResponse() : []; } });
    expect(tasks.map((t) => t.platform)).toEqual(STORES.map((s) => s.platform));
    await Promise.all(tasks.map((t) => t.fn()));
    for (const store of STORES) expect(asked.some((url) => url.startsWith(store.baseUrl))).toBe(true);
    expect(asked.filter((url) => url.includes("/search/suggest.json"))).toHaveLength(STORES.filter((s) => s.type === "shopify").length);
    expect(asked.filter((url) => url.includes("/wp-json/wc/store/v1/products"))).toHaveLength(STORES.filter((s) => s.type === "woocommerce").length);
  });

  it("one store failing does not stop the others", async () => {
    const tasks = storeTasks("iphone", { fetchJson: async (url) => { if (url.includes("mistore")) throw new Error("mistore.pk: HTTP 503"); return url.includes("suggest.json") ? shopifyResponse(shopifyProduct()) : []; } });
    const settled = await Promise.allSettled(tasks.map((t) => t.fn()));
    expect(settled.map((s) => s.status)).toEqual(["rejected", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  });
});
