// storefront.scraper.js: AlfaMall and Faysal DigiMall's search backend. The item shape below is trimmed from real answers read on
// 2026-10-22 (be.alfamall.com and digimall-be.faysalbank.com, /storefront/search_products).
import { describe, it, expect } from "vitest";

import { scrapeStorefrontSearch } from "../src/scrapers/storefront.scraper.js";
import { STORES } from "../src/scrapers/stores.js";

const ALFAMALL = STORES.find((s) => s.platform === "alfamall");
const DIGIMALL = STORES.find((s) => s.platform === "digimall");

const item = (over = {}) => ({
  id: "190326123701208089",
  title: "Samsung Galaxy A17 256GB 8GB RAM - ISPK-0542",
  handle: "samsung-galaxy-a17-256gb-8gb-ram-ispk-0542",
  images: ["https://cdn.comverseglobal.com/alfa/products/product_images/a17.jpg"],
  sold_out: false,
  variant_detail: { discounted_price: "65,698", original_price: "65,698", max_original_price: "65,698", max_discounted_price: "65,698" },
  category: [{ id: 11425, title: "Mobile Phones & Tablets", handle: "mobile-phones-tablets" }],
  ...over,
});
const caseItem = (n) => item({
  title: `iPhone 17 Pro Case ${n}`, handle: `iphone-17-pro-case-${n}`,
  category: [{ title: "Accessories", handle: "mobile-phones-tablets/acessories" }, { title: "Cases & Covers", handle: "mobile-phones-tablets/acessories/cases-covers" }],
});
const answer = (...results) => ({ count: results.length, results });

describe("scrapeStorefrontSearch", () => {
  it("asks the store's backend with exactly what its own search page sends, the search encoded", async () => {
    const asked = [];
    await scrapeStorefrontSearch(ALFAMALL, "samsung galaxy a17", { fetchJson: async (url) => { asked.push(url); return answer(item()); } });
    const url = new URL(asked[0]);
    expect(`${url.origin}${url.pathname}`).toBe("https://be.alfamall.com/storefront/search_products");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      storefront: "undefined", isFashion: "undefined", storefront_domain: "alfamall.com", q: "samsung galaxy a17", page: "1", limit: "40",
    });
    asked.length = 0;
    await scrapeStorefrontSearch(DIGIMALL, "a17", { fetchJson: async (url) => { asked.push(url); return answer(item()); } });
    expect(new URL(asked[0]).searchParams.get("storefront")).toBe("23");
    expect(asked[0]).toMatch(/^https:\/\/digimall-be\.faysalbank\.com\/storefront\/search_products\?/);
  });

  it("turns a result into a listing: the store's product address, price, was-price, picture, stock", async () => {
    const [listing] = await scrapeStorefrontSearch(DIGIMALL, "iphone", {
      fetchJson: async () => answer(item({ handle: "apple-iphone-17-pro-12gb-ram-1", title: "  Apple iPhone 17 Pro   12GB RAM ", variant_detail: { discounted_price: "474,999", original_price: "599,999", max_discounted_price: "699,999" } })),
    });
    expect(listing).toMatchObject({
      platform: "digimall",
      sourceUrl: "https://digimall.faysalbank.com/product/apple-iphone-17-pro-12gb-ram-1",
      title: "Apple iPhone 17 Pro 12GB RAM",
      price: 474999, // a product covering several variants is saved at its lowest price
      originalPrice: 599999,
      imageUrl: "https://cdn.comverseglobal.com/alfa/products/product_images/a17.jpg",
      inStock: true,
    });
    const [alfa] = await scrapeStorefrontSearch(ALFAMALL, "a17", { fetchJson: async () => answer(item()) });
    expect(alfa.sourceUrl).toBe("https://alfamall.com/samsung-galaxy-a17-256gb-8gb-ram-ispk-0542"); // AlfaMall pages have no /product/
    expect(alfa.originalPrice).toBeNull(); // a was-price equal to the price is not a discount
  });

  it("marks a sold-out product out of stock, and keeps only a picture on https", async () => {
    const [listing] = await scrapeStorefrontSearch(ALFAMALL, "a17", { fetchJson: async () => answer(item({ sold_out: true, images: ["javascript:alert(1)", "http://x/y.jpg"] })) });
    expect(listing).toMatchObject({ inStock: false, imageUrl: null });
  });

  it("leaves out a result with no price, no title or an unusable handle, without failing the others", async () => {
    const listings = await scrapeStorefrontSearch(ALFAMALL, "a17", {
      fetchJson: async () => answer(
        item({ variant_detail: { discounted_price: "0" } }),
        item({ title: "  " }),
        item({ handle: "../../admin" }),
        item({ handle: "two words" }),
        item({ handle: "fine-one" }),
      ),
    });
    expect(listings.map((l) => l.sourceUrl)).toEqual(["https://alfamall.com/fine-one"]);
  });

  it("reads a second page only while the first is mostly accessories", async () => {
    const pages = [];
    const fullOfCases = answer(...Array.from({ length: 40 }, (_, i) => caseItem(i)));
    await scrapeStorefrontSearch(ALFAMALL, "iphone 17 pro", { fetchJson: async (url) => { pages.push(new URL(url).searchParams.get("page")); return pages.length === 1 ? fullOfCases : answer(item(), item({ handle: "b" })); } });
    expect(pages).toEqual(["1", "2"]);

    pages.length = 0;
    const withPhones = answer(...Array.from({ length: 38 }, (_, i) => caseItem(i)), item({ handle: "a" }), item({ handle: "b" }));
    await scrapeStorefrontSearch(ALFAMALL, "iphone 17 pro", { fetchJson: async (url) => { pages.push(new URL(url).searchParams.get("page")); return withPhones; } });
    expect(pages).toEqual(["1"]);

    pages.length = 0;
    await scrapeStorefrontSearch(ALFAMALL, "iphone 17 pro", { fetchJson: async (url) => { pages.push(new URL(url).searchParams.get("page")); return answer(caseItem(1)); } });
    expect(pages).toEqual(["1"]); // a short page is the last one
  });

  it("leaves out a service named after a phone, and a price that is an instalment or a deposit (live AlfaMall titles)", async () => {
    const listings = await scrapeStorefrontSearch(ALFAMALL, "iphone 17 pro", {
      fetchJson: async () => answer(
        item({ handle: "s", title: "PTA Approval Service iPhone 17 Pro", variant_detail: { discounted_price: "218,899", original_price: "218,899" } }),
        item({ handle: "m", title: "Apple Iphone 17 Pro Max 512 | PTA Approved | On Easy Monthly Installment", variant_detail: { discounted_price: "27,649", original_price: "612,799" } }),
        item({ handle: "d", title: "Apple iPhone 17 Pro 256GB", variant_detail: { discounted_price: "90,000", original_price: "475,000" } }),
        item({ handle: "keep-sale", title: "Apple iPhone 17 Pro 256GB", variant_detail: { discounted_price: "400,000", original_price: "475,000" } }),
        item({ handle: "keep-plan", title: "Samsung Galaxy A17 On Installment", variant_detail: { discounted_price: "63,749", original_price: "66,749" } }),
      ),
    });
    expect(listings.map((l) => l.sourceUrl.split("/").pop())).toEqual(["keep-sale", "keep-plan"]);
  });

  it("reports an answer that is not a product search, and passes a failed request on", async () => {
    await expect(scrapeStorefrontSearch(ALFAMALL, "a17", { fetchJson: async () => ({ detail: "storefront not found" }) })).rejects.toThrow("alfamall: unexpected search response");
    await expect(scrapeStorefrontSearch(ALFAMALL, "a17", { fetchJson: async () => { throw new Error("be.alfamall.com: HTTP 503"); } })).rejects.toThrow("HTTP 503");
  });
});
