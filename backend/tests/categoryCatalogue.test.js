import { describe, it, expect } from "vitest";

import { categoryCatalogue, megaCategories, megaCategoryUrl, parseMegaCategoryHtml } from "../src/scrapers/catalogue.js";
import { CATALOGUE_STORES } from "../src/services/catalogueRefresh.service.js";

const item = (n) => ({ sourceUrl: `https://s.pk/p${n}`, title: `P${n}`, price: n });

describe("categoryCatalogue (iShopping and Mega category pages, 2026-11-18)", () => {
  it("reads each category until a page adds nothing, and yields a product listed twice once", async () => {
    const pages = { "a?1": [1, 2], "a?2": [3], "a?3": [3], "b?1": [3, 4], "b?2": [] };
    const store = { platform: "s", baseUrl: "https://s.pk", categories: ["a", "b"], parse: (html) => html, pageUrl: (c, p) => `${c}?${p}` };
    const seen = [];
    for await (const page of categoryCatalogue(store, { fetchText: async (url) => (pages[url] ?? []).map(item) })) seen.push(page.map((l) => l.price));
    expect(seen).toEqual([[1, 2], [3], [4]]);
  });

  it("reports a failed page, and fails the store only when every category fails", async () => {
    const errors = [];
    const store = { platform: "s", baseUrl: "https://s.pk", categories: ["a", "b"], parse: (x) => x, pageUrl: (c, p) => `${c}?${p}` };
    const fetchText = async (url) => { if (url.startsWith("a")) throw new Error("HTTP 500"); return url === "b?1" ? [item(1)] : []; };
    for await (const _page of categoryCatalogue(store, { fetchText, onError: ({ error }) => errors.push(error.message) })) { /* read */ }
    expect(errors).toEqual(["a?1: HTTP 500"]);
    const allFail = categoryCatalogue(store, { fetchText: async () => { throw new Error("HTTP 403"); } });
    await expect((async () => { for await (const _p of allFail) { /* read */ } })()).rejects.toThrow(/every category failed/);
  });
});

describe("Mega category pages", () => {
  it("reads the categories from our listings' addresses, and pages as /mobiles/2/", () => {
    expect(megaCategories(["https://www.mega.pk/laptop_products/1/a.html", "https://www.mega.pk/laptop_products/2/b.html", "https://www.mega.pk/mobiles_products/3/c.html"])).toEqual(["laptop", "mobiles"]);
    expect(megaCategoryUrl("mobiles", 1)).toBe("https://www.mega.pk/mobiles/");
    expect(megaCategoryUrl("mobiles", 2)).toBe("https://www.mega.pk/mobiles/2/");
  });

  it("parses a card like its search scraper, the was price apart", () => {
    const html = `<ul><li data-brand="apple"><div id="lap_name_div"><h3><a href="https://www.mega.pk/mobiles_products/26781/Apple-iPhone-17-Pro.html">Apple iPhone 17 Pro</a></h3></div>
      <div class="cat_price">334,999 - PKR <span class="was">359,999 - PKR</span></div></li><li data-brand="x"><div id="lap_name_div"><h3><a href="/x">No price</a></h3></div></li></ul>`;
    expect(parseMegaCategoryHtml(html)).toMatchObject([{ platform: "mega", title: "Apple iPhone 17 Pro", price: 334999, originalPrice: 359999, inStock: true,
      sourceUrl: "https://www.mega.pk/mobiles_products/26781/Apple-iPhone-17-Pro.html" }]);
  });
});

describe("the catalogue stores", () => {
  it("now include iShopping and Mega, read by category", () => {
    expect(CATALOGUE_STORES.filter((s) => s.type === "category").map((s) => s.platform)).toEqual(["ishopping", "mega"]);
  });
});
