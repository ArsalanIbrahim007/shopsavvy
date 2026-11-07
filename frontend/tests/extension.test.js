// The browser extension (../extension, 2026-11-07): the page reader on the shapes the real stores' pages have (checked live on
// PriceOye, Mega, Shophive, iShopping, Paklap, Jalal Electronics, eezepc, W11Stop and Daraz that day), the store list against
// the manifest and the API, and the words the panel shows.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tests run from frontend/ (npm test there and in CI).
const read = (file) => readFileSync(join(process.cwd(), "..", "extension", file), "utf8");

let readProduct, STORES, storeOfHost, storeName, badgeSaving, safeLink, summary;
beforeAll(async () => {
  // Plain scripts (no exports): each puts its functions on globalThis, as in the browser.
  await import("../../extension/stores.js");
  await import("../../extension/format.js");
  await import("../../extension/reader.js");
  ({ readProduct } = globalThis.ShopSavvyReader);
  ({ STORES, storeOfHost, storeName } = globalThis.ShopSavvyStores);
  ({ badgeSaving, safeLink, summary } = globalThis.ShopSavvyFormat);
});

/** A document with `head` and `body` HTML and the given body class. */
function page({ head = "", body = "", bodyClass = "" } = {}) {
  const doc = document.implementation.createHTMLDocument("t");
  doc.head.innerHTML = head;
  doc.body.innerHTML = body;
  if (bodyClass) doc.body.className = bodyClass;
  return doc;
}
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const URL_ = "https://www.example.pk/p";

describe("readProduct", () => {
  it("reads schema.org Product data, the way PriceOye and Mega publish it", () => {
    const doc = page({ head: ld({ "@context": "https://schema.org", "@type": "Product", name: "APPLE AIRPODS MAX 2", offers: { "@type": "Offer", price: "161999.00" } }) });
    expect(readProduct(doc, URL_)).toEqual({ url: URL_, title: "APPLE AIRPODS MAX 2", price: 161999 });
  });

  it("finds the Product inside @graph or an array, with offers as an array (Paklap)", () => {
    const graph = page({ head: ld({ "@graph": [{ "@type": "WebPage" }, { "@type": ["Product"], name: "Apple Airpods 3rd Generation", offers: [{ price: 65999 }] }] }) });
    expect(readProduct(graph, URL_)).toMatchObject({ title: "Apple Airpods 3rd Generation", price: 65999 });
    const list = page({ head: ld([{ "@type": "BreadcrumbList" }, { "@type": "Product", name: "X", offers: { "@type": "AggregateOffer", lowPrice: "4770" } }]) });
    expect(readProduct(list, URL_)).toMatchObject({ title: "X", price: 4770 });
  });

  it("skips a broken data block and reads the next", () => {
    const doc = page({ head: `<script type="application/ld+json">{not json</script>${ld({ "@type": "Product", name: "Y", offers: { price: 10 } })}` });
    expect(readProduct(doc, URL_)).toMatchObject({ title: "Y", price: 10 });
  });

  it("reads Open Graph product tags (Shophive), and ignores a price of 0 (Mega's meta says 0)", () => {
    const meta = (p) => `<meta property="og:type" content="product"><meta property="og:title" content="TCL iFFALCON 65&quot; U65A Pro"><meta property="product:price:amount" content="${p}">`;
    expect(readProduct(page({ head: meta("181499") }), URL_)).toMatchObject({ title: 'TCL iFFALCON 65" U65A Pro', price: 181499 });
    expect(readProduct(page({ head: meta("0") }), URL_).price).toBeNull();
  });

  it("reads a Magento product page by its final price (iShopping: no Product data, og:type website)", () => {
    const doc = page({
      head: '<meta property="og:type" content="website">',
      bodyClass: "catalog-product-view",
      body: '<h1 class="page-title"> TCL 55" QLED TV (P79K) </h1><div class="product-info-main"><span data-price-type="oldPrice" data-price-amount="170000"></span><span data-price-type="finalPrice" data-price-amount="150520"></span></div>',
    });
    expect(readProduct(doc, URL_)).toMatchObject({ title: 'TCL 55" QLED TV (P79K)', price: 150520 });
  });

  it("prefers a WooCommerce store's visible name to a search-engine title in its data (eezepc)", () => {
    const doc = page({
      head: ld({ "@type": "Product", name: "Buy Apple Airpods 2 Pro at Lowest price in Pakistan", offers: { price: 55990 } }),
      bodyClass: "single-product",
      body: '<h1 class="product_title">Apple AirPods 2 Pro Wireless Earbuds with MagSafe Charging Case</h1>',
    });
    expect(readProduct(doc, URL_)).toMatchObject({ title: "Apple AirPods 2 Pro Wireless Earbuds with MagSafe Charging Case", price: 55990 });
  });

  it("reads a WooCommerce page with no data, taking the sale price, not the struck-out one", () => {
    const doc = page({ bodyClass: "single-product", body: '<h1 class="product_title">Z</h1><div class="summary"><p class="price"><del><span class="amount">Rs 9,000</span></del><ins><span class="amount">Rs 7,500</span></ins></p></div>' });
    expect(readProduct(doc, URL_)).toMatchObject({ title: "Z", price: 7500 });
  });

  it("takes Daraz's current price from the page when its data has none, never the struck-out one", () => {
    const doc = page({
      head: ld({ "@type": "Product", name: "Apple iPhone 17 Pro Max - 512GB", offers: { "@type": "Offer" } }),
      body: '<span class="pdp-price pdp-price_type_deleted">Rs. 612,799</span><span class="pdp-price pdp-price_type_normal">Rs. 559,999</span>',
    });
    expect(readProduct(doc, URL_)).toMatchObject({ price: 559999 });
  });

  it("says nothing for a page that is not a product (a category, the home page)", () => {
    expect(readProduct(page({ head: '<meta property="og:type" content="website">', body: "<h1>Mobiles</h1>" }), URL_)).toBeNull();
    expect(readProduct(page({ head: ld({ "@type": "ItemList", name: "Mobiles" }) }), URL_)).toBeNull();
  });
});

describe("the store list", () => {
  it("knows a store with or without www., and names it", () => {
    expect(storeOfHost("www.mega.pk")).toEqual({ platform: "mega", name: "Mega.pk" });
    expect(storeOfHost("digimall.faysalbank.com").platform).toBe("digimall");
    expect(storeOfHost("example.com")).toBeNull();
    expect(storeName("ishopping")).toBe("iShopping");
  });

  it("runs on every store it knows, and only those (manifest.json)", () => {
    const matches = JSON.parse(read("manifest.json")).content_scripts[0].matches;
    const hosts = matches.map((m) => m.replace(/^https:\/\/(\*\.)?/, "").replace(/\/\*$/, ""));
    expect(hosts.sort()).toEqual(Object.keys(STORES).sort());
  });

  it("is the API's list of stores, less Telemart (it now redirects to a site that forbids collecting prices)", () => {
    const api = read("../backend/src/services/productMatch.service.js");
    const start = api.indexOf("STORE_HOSTS = Object.freeze({");
    const block = api.slice(start, api.indexOf("});", start));
    const apiHosts = [...block.matchAll(/"([a-z0-9.-]+)":\s*"[a-z0-9]+"/g)].map((m) => m[1]).filter((h) => h !== "telemart.pk");
    expect(apiHosts.sort()).toEqual(Object.keys(STORES).sort());
  });
});

describe("what the panel says", () => {
  const offer = (platform, price, over = {}) => ({ id: platform, platform, price, url: `https://${platform}.example/p`, inStock: true, ...over });

  it("leads with the saving when another store is cheaper, and drops this page's own praise", () => {
    const result = { found: true, matchedBy: "url", offers: [offer("shophive", 143999), offer("mega", 155000)], cheapest: { ...offer("shophive", 143999), saving: 6521, cheaperThanThisPage: true }, advice: { action: "GOOD_DEAL" } };
    expect(summary(result, storeName)).toEqual({ tone: "save", headline: "PKR 143,999 at Shophive: save PKR 6,521", lines: [] });
  });

  it("says when this page is the lowest, and passes on the warnings", () => {
    const result = {
      found: true, matchedBy: "similar", offers: [offer("digimall", 181499)], cheapest: { ...offer("digimall", 181499), saving: 0, cheaperThanThisPage: false },
      atLow: { thisPage: true }, discountVerdict: { discount: { classification: "suspicious" }, price: null }, advice: { action: "BUY_NOW" },
    };
    expect(summary(result, storeName)).toEqual({
      tone: "best",
      headline: "This is the lowest price we found",
      lines: ["The lowest price we have recorded for it", "The store's discount looks doubtful", "Matched by name and price: check it is the same model", "Our verdict: Buy now"],
    });
  });

  it("fits the saving into the badge, and makes only http(s) addresses into links", () => {
    expect([badgeSaving(950), badgeSaving(6521), badgeSaving(150000), badgeSaving(1250000), badgeSaving(0)]).toEqual(["-950", "-7k", "-1.5L", "-13L", ""]);
    expect(safeLink("https://www.shophive.com/x")).toBe("https://www.shophive.com/x");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("not a url")).toBeNull();
  });
});
