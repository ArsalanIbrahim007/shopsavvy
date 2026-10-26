// GET /api/listings/match (R3, for the browser extension) and productMatch.service.js. The endpoint is exercised through the REAL
// application with the database replaced by controlled rows, the way api.endpoints.test.js does it.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/scraper.service.js", () => ({
  fetchAndRefreshListings: vi.fn(async () => ({ scraped: false, reason: "fresh_data" })),
}));
vi.mock("../src/services/historyEnrichment.service.js", () => ({
  attachPriceHistory: vi.fn(async (listings) => listings.map((l) => ({ ...(l.toObject ? l.toObject() : l), priceHistory: [] }))),
}));

import Listing from "../src/models/listing.model.js";
import { normalizeTitle } from "../src/services/normalizeTitle.service.js";
import { createApp } from "../src/createApp.js";
import { clearMatchCache } from "../src/controllers/product.controller.js";
import { fetchAndRefreshListings } from "../src/services/scraper.service.js";
import {
  storeOfPage, samePagePattern, choosePageListing, showsAnotherVariant, cheapestElsewhere, siteUrl, matchResponse, VARIANT_PRICE_GAP,
} from "../src/services/productMatch.service.js";

const NOW = Date.now();
const FRESH = new Date(NOW).toISOString();
const ID = (n) => `6a78a2af9c96f297ede774${String(n).padStart(2, "0")}`;
const row = (n, platform, title, price, sourceUrl, over = {}) => ({
  _id: ID(n), platform, title, normalizedTitle: normalizeTitle(title), price, originalPrice: null, inStock: true, productCategory: "smartphone",
  ptaStatus: "unknown", condition: "new", lastScrapedAt: FRESH, sourceUrl, productUrl: sourceUrl, ...over,
});

describe("storeOfPage", () => {
  it("knows the stores by address, with or without www. and m.", () => {
    expect(storeOfPage("https://priceoye.pk/mobiles/apple/apple-iphone-17")?.platform).toBe("priceoye");
    expect(storeOfPage("https://www.mega.pk/mobiles_products/1/x.html")?.platform).toBe("mega");
    expect(storeOfPage("https://m.daraz.pk/products/x.html")?.platform).toBe("daraz");
    expect(storeOfPage("http://WWW.SHOPHIVE.COM/x/")?.platform).toBe("shophive");
  });

  it("refuses anything that is not an http(s) page of a known store", () => {
    for (const address of ["https://www.amazon.com/dp/1", "javascript:alert(1)", "not a url", "https://user:pw@priceoye.pk/x",
      "https://priceoye.pk.evil.com/x", "ftp://priceoye.pk/x", ""]) {
      expect(storeOfPage(address)).toBeNull();
    }
  });
});

describe("samePagePattern", () => {
  const pattern = samePagePattern(storeOfPage("https://priceoye.pk/mobiles/apple/apple-iphone-17"));

  it("matches the stored address whatever the scheme, www., case, trailing slash or query string", () => {
    for (const stored of ["https://priceoye.pk/mobiles/apple/apple-iphone-17", "http://www.priceoye.pk/mobiles/apple/apple-iphone-17/",
      "https://priceoye.pk/Mobiles/Apple/Apple-iPhone-17?utm=1", "https://priceoye.pk/mobiles/apple/apple-iphone-17#reviews"]) {
      expect(pattern.test(stored)).toBe(true);
    }
  });

  it("does not match a longer address that starts the same, or another store", () => {
    expect(pattern.test("https://priceoye.pk/mobiles/apple/apple-iphone-17-pro")).toBe(false);
    expect(pattern.test("https://priceoye.pk/mobiles/apple/apple-iphone-17/reviews")).toBe(false);
    expect(pattern.test("https://mega.pk/mobiles/apple/apple-iphone-17")).toBe(false);
  });

  it("treats regex characters in the address as text", () => {
    const odd = samePagePattern(storeOfPage("https://www.mega.pk/a+b(c).html"));
    expect(odd.test("https://www.mega.pk/a+b(c).html")).toBe(true);
    expect(odd.test("https://www.mega.pk/aab(c).html")).toBe(false);
  });
});

describe("choosePageListing", () => {
  const base = "https://eezepc.com/product/redmi-note-14-pro/";
  const v256 = row(1, "eezepc", "Xiaomi Redmi Note 14 Pro 8GB – 256GB", 79990, `${base}?attribute_capacity=8GB%20256GB`);
  const v512 = row(2, "eezepc", "Xiaomi Redmi Note 14 Pro 12GB – 512GB", 91790, `${base}?attribute_capacity=12GB%20512GB`);

  it("takes the listing with the page's query string (the variant)", () => {
    expect(choosePageListing([v256, v512], { address: `${base}?attribute_capacity=12GB%20512GB` })).toBe(v512);
  });

  it("never takes a listing whose title contradicts the page's", () => {
    expect(choosePageListing([v256, v512], { address: base, title: "Redmi Note 14 Pro 12GB 512GB" })).toBe(v512);
    expect(choosePageListing([v256], { address: base, title: "Redmi Note 14 Pro 12GB 512GB" })).toBeNull();
  });

  it("then the nearest price, then the most recently checked", () => {
    const a = row(3, "shophive", "Galaxy A17", 60000, "u", { lastScrapedAt: new Date(NOW - 86400000).toISOString() });
    const b = row(4, "shophive", "Galaxy A17", 65000, "u");
    expect(choosePageListing([a, b], { address: "x", price: 64000 })).toBe(b);
    expect(choosePageListing([a, b], { address: "x", price: 60500 })).toBe(a);
    expect(choosePageListing([a, b], { address: "x" })).toBe(b);
    expect(choosePageListing([], { address: "x" })).toBeNull();
  });
});

describe("showsAnotherVariant", () => {
  const listing = row(1, "priceoye", "Apple Iphone 17", 400000, "u");
  const view = { selectedGroup: { storage: 256 } };

  it("when the page states another capacity than the product", () => {
    expect(showsAnotherVariant(view, listing, { title: "Apple iPhone 17 512GB" })).toBe(true);
    expect(showsAnotherVariant(view, listing, { title: "Apple iPhone 17 256GB" })).toBe(false);
    expect(showsAnotherVariant({ selectedGroup: null }, row(2, "x", "iPhone 17 256GB", 1, "u"), { title: "iPhone 17 512GB" })).toBe(true);
  });

  it(`when the page price is more than ${VARIANT_PRICE_GAP * 100}% from our record`, () => {
    expect(showsAnotherVariant(view, listing, { price: 460000 })).toBe(false); // exactly 15%
    expect(showsAnotherVariant(view, listing, { price: 460001 })).toBe(true);
    expect(showsAnotherVariant(view, listing, { price: 339999 })).toBe(true);
    expect(showsAnotherVariant(view, listing, {})).toBe(false);
  });
});

describe("cheapestElsewhere", () => {
  const offer = (platform, price, over = {}) => ({ platform, price, inStock: true, outOfDate: false, unusualPrice: false, ptaStatus: "pta_approved", ...over });

  it("is the cheapest offer a shopper can act on at another store", () => {
    const others = [offer("mega", 90), offer("priceoye", 80, { inStock: false }), offer("telemart", 70, { outOfDate: true }),
      offer("w11stop", 60, { unusualPrice: true }), offer("shophive", 50), offer("ishopping", 95)];
    expect(cheapestElsewhere(others, { productPta: null, platform: "shophive" }).platform).toBe("mega");
    expect(cheapestElsewhere(others, { productPta: null, platform: "ishopping" }).platform).toBe("shophive");
  });

  it("for a product sold PTA-approved, only an offer that says so", () => {
    const others = [offer("mega", 90), offer("shophive", 50, { ptaStatus: "unknown" })];
    expect(cheapestElsewhere(others, { productPta: "pta_approved", platform: "x" }).platform).toBe("mega");
    expect(cheapestElsewhere(others, { productPta: "unknown", platform: "x" }).platform).toBe("shophive");
    expect(cheapestElsewhere([], { productPta: null, platform: "x" })).toBeNull();
  });
});

describe("siteUrl", () => {
  it("is PUBLIC_SITE_URL without a trailing slash, else the local development address", () => {
    expect(siteUrl({ PUBLIC_SITE_URL: "https://shopsavvy.example/" })).toBe("https://shopsavvy.example");
    expect(siteUrl({})).toBe("http://localhost:5173");
    expect(siteUrl({ PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:5173");
  });
});

describe("matchResponse", () => {
  const self = { ...row(1, "priceoye", "Galaxy A17 8GB 256GB", 70000, "u1"),
    discountAnalysis: { classification: "no_claimed_discount" }, discountAnomaly: { status: "consistent", reason: "ok" },
    recommendation: { action: "WAIT", reason: "r" }, ptaAssessment: "not_stated" };
  const other = row(2, "mega", "Galaxy A17 8GB 256GB", 65000, "u2", { ptaStatus: "pta_approved" });
  const view = { selectedListing: self, selectedGroup: { ptaStatus: "pta_approved", bestDeal: other }, offers: [self, other] };
  const site = "https://s.example";

  it("says what the extension shows: the other offers, the saving, the verdicts and the links", () => {
    const r = matchResponse(view, { matchedBy: "url", pageId: ID(1), pagePrice: 69999, title: "Galaxy A17", site, now: NOW });
    expect(r).toMatchObject({ found: true, matchedBy: "url", listing: { id: ID(1), platform: "priceoye" } });
    expect(r.offers.map((o) => o.platform)).toEqual(["mega"]);
    expect(r.cheapest).toMatchObject({ platform: "mega", saving: 4999, cheaperThanThisPage: true });
    expect(r.discountVerdict).toEqual({ discount: null, market: { status: "consistent", reason: "ok" }, price: null });
    expect(r.advice).toEqual({ action: "WAIT", reason: "r" });
    expect(r.pta).toEqual({ product: "pta_approved", thisPage: "not_stated" });
    expect(r.productUrl).toBe(`${site}/product/galaxy-a17-8gb-256gb-${ID(1)}`); // the readable address (productPath.js)
    expect(r.searchUrl).toBe(`${site}/results?q=Galaxy%20A17`);
  });

  it("uses the stored price when the page sent none, and never a negative saving", () => {
    const r = matchResponse(view, { matchedBy: "url", pageId: ID(1), site, now: NOW });
    expect(r.cheapest.saving).toBe(5000);
    const cheap = matchResponse(view, { matchedBy: "url", pageId: ID(1), pagePrice: 60000, site, now: NOW });
    expect(cheap.cheapest).toMatchObject({ saving: 0, cheaperThanThisPage: false });
  });

  it("says whether this page is at the lowest price recorded for the product", () => {
    const DAY = 86_400_000;
    const history = [100000, 98000, 99000, 97000, 96000, 70000, 65000].map((price, i, all) => ({ price, recordedAt: new Date(NOW - (all.length - 1 - i) * DAY) }));
    const withHistory = { ...view, offers: [self, { ...other, priceHistory: history }] };
    const above = matchResponse(withHistory, { matchedBy: "url", pageId: ID(1), pagePrice: 70000, site, now: NOW });
    expect(above.atLow).toMatchObject({ price: 65000, thisPage: false });
    const at = matchResponse(withHistory, { matchedBy: "url", pageId: ID(1), pagePrice: 65000, site, now: NOW });
    expect(at.atLow.thisPage).toBe(true);
  });

  it("for a page we do not store: no record of it, links to the product's best deal, and not found when it is alone", () => {
    const cheaper = row(3, "telemart", "Galaxy A17 8GB 256GB", 60000, "u3");
    const r = matchResponse({ ...view, offers: [self, other, cheaper] },
      { matchedBy: "similar", pageId: ID(1), pagePrice: 70000, title: "Galaxy A17 PTA Approved", site, now: NOW });
    expect(r).toMatchObject({ found: true, matchedBy: "similar", listing: null, discountVerdict: null, advice: null });
    expect(r.pta.thisPage).toBe("pta_approved");
    expect(r.productUrl).toBe(`${site}/product/galaxy-a17-8gb-256gb-${ID(2)}`); // the product's best deal, not merely its cheapest offer
    const alone = matchResponse({ ...view, offers: [self] }, { matchedBy: "similar", pageId: ID(1), title: "x", site, now: NOW });
    expect(alone).toMatchObject({ found: false, reason: "no_match", offers: [], productUrl: null });
  });
});

// ---- the endpoint, through the real application ----

// The Mongoose query chain as a thenable holding `rows`.
function chain(rows) {
  const q = { sort: () => q, skip: () => q, limit: () => q, lean: () => q, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  return q;
}

const P17 = "https://priceoye.pk/mobiles/apple/apple-iphone-17";
const CATALOG = [
  row(1, "priceoye", "Apple Iphone 17", 400000, P17, { ptaStatus: "pta_approved" }),
  row(2, "mega", "Apple iPhone 17 256GB Storage PTA Approved", 390000, "https://www.mega.pk/mobiles_products/1/iphone-17-256.html"),
  row(3, "shophive", "Apple iPhone 17 256GB PTA Approved", 395000, "https://www.shophive.com/apple-iphone-17-256gb/"),
  row(4, "shophive", "Apple iPhone 17 512GB PTA Approved", 480000, "https://www.shophive.com/apple-iphone-17-512gb/"),
  row(5, "mega", "Apple iPhone 17 512GB Storage PTA Approved", 475000, "https://www.mega.pk/mobiles_products/2/iphone-17-512.html"),
  row(6, "daraz", "Apple iPhone 17 256GB", 300000, "https://www.daraz.pk/products/iphone-17-i1.html"), // a switched-off store
];

/** Answers Listing.find the way MongoDB would for the filters productMatch and productView use. */
function fakeFind(filter) {
  const visible = (r) => !filter.platform?.$nin?.includes(r.platform);
  let rows = CATALOG.filter(visible);
  if (typeof filter.platform === "string") rows = rows.filter((r) => r.platform === filter.platform);
  if (filter.sourceUrl instanceof RegExp) rows = rows.filter((r) => filter.sourceUrl.test(r.sourceUrl));
  if (filter.normalizedTitle) rows = rows.filter((r) => r.normalizedTitle === filter.normalizedTitle);
  if (filter.productCategory) rows = rows.filter((r) => r.productCategory === filter.productCategory);
  if (filter._id?.$ne) rows = rows.filter((r) => String(r._id) !== String(filter._id.$ne));
  return chain(rows.map((r) => ({ ...r })));
}

let server;
let base;
const get = (query) => fetch(`${base}/api/listings/match?${new URLSearchParams(query)}`).then(async (res) => ({ res, body: await res.json() }));

beforeAll(async () => {
  await new Promise((resolve) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  clearMatchCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(Listing, "find").mockImplementation(fakeFind);
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/listings/match", () => {
  it("finds a page by its address and returns the same product at the other stores", async () => {
    const { res, body } = await get({ url: `${P17}?utm_source=x`, title: "Apple iPhone 17", price: "PKR 4,00,000" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, found: true, matchedBy: "url", listing: { platform: "priceoye", price: 400000 } });
    expect(body.offers.map((o) => o.platform).sort()).toEqual(["mega", "shophive"]);
    expect(body.offers.every((o) => !o.title.includes("512GB"))).toBe(true);
    expect(body.cheapest).toMatchObject({ platform: "mega", price: 390000, saving: 10000, cheaperThanThisPage: true });
    expect(body.productUrl).toMatch(new RegExp(`^http://localhost:5173/product/apple-iphone-17[a-z0-9-]*-${ID(1)}$`));
  });

  it("takes a page that shows another variant than our record of its address to that variant's product", async () => {
    const { body } = await get({ url: P17, title: "Apple iPhone 17 512GB", price: "480000" });
    expect(body).toMatchObject({ found: true, matchedBy: "similar", listing: null });
    expect(body.offers.map((o) => o.title).sort()).toEqual(["Apple iPhone 17 512GB PTA Approved", "Apple iPhone 17 512GB Storage PTA Approved"]);
  });

  it("finds a moved page by the same store's title", async () => {
    const { body } = await get({ url: "https://www.shophive.com/new-address/", title: "Apple iPhone 17 512GB PTA Approved", price: "480000" });
    expect(body).toMatchObject({ found: true, matchedBy: "title", listing: { id: ID(4) } });
    expect(body.offers.map((o) => o.platform)).toEqual(["mega"]);
  });

  it("matches the address with or without a trailing slash", async () => {
    expect((await get({ url: `${P17}/` })).body).toMatchObject({ found: true, matchedBy: "url", listing: { id: ID(1) } });
  });

  it("places a page we do not store, never using a switched-off store's hidden listings", async () => {
    const { body } = await get({ url: "https://www.daraz.pk/products/iphone-17-i1.html", title: "Apple iPhone 17 256GB", price: "395000" });
    expect(body).toMatchObject({ found: true, matchedBy: "similar", listing: null });
    expect(body.offers.map((o) => o.platform)).not.toContain("daraz");
    expect(body.offers.length).toBeGreaterThan(0);
    // Even at the hidden listing's own address and price, it is not taken for that listing.
    const same = await get({ url: "https://www.daraz.pk/products/iphone-17-i1.html", title: "Apple iPhone 17 256GB", price: "300000" });
    expect(same.body.listing).toBeNull();
    expect(same.body.matchedBy).not.toBe("url");
  });

  it("needs the page's price to place a page we do not store", async () => {
    expect((await get({ url: "https://www.mega.pk/unknown.html", title: "Apple iPhone 17 Pro 256GB" })).body).toMatchObject({ found: false, reason: "not_stored" });
    // With the price, the same page is placed.
    expect((await get({ url: "https://www.mega.pk/unknown.html", title: "Apple iPhone 17 512GB Sky Blue", price: "478000" })).body).toMatchObject({ found: true, matchedBy: "similar" });
  });

  it("says why when it finds nothing", async () => {
    expect((await get({ url: "https://www.amazon.com/dp/1", title: "iPhone 17" })).body).toMatchObject({ found: false, reason: "store_not_covered", searchUrl: "http://localhost:5173/results?q=iPhone%2017" });
    expect((await get({ url: "https://www.mega.pk/unknown.html" })).body).toMatchObject({ found: false, reason: "not_stored", searchUrl: null });
    expect((await get({ url: "https://www.mega.pk/unknown.html", title: "Nokia 3310 Classic Keypad", price: "5000" })).body)
      .toMatchObject({ found: false, reason: "no_match" });
  });

  it("refuses a missing or over-long address, an over-long title and a price that is not rupees", async () => {
    for (const query of [{}, { url: `https://priceoye.pk/${"a".repeat(2050)}` }, { url: P17, title: "t".repeat(301) },
      { url: P17, price: "free" }, { url: P17, price: "0" }, { url: P17, price: "99999999999" }]) {
      const { res, body } = await get(query);
      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    }
  });

  it("never scrapes and never writes, and answers a repeat from its cache", async () => {
    const write = ["create", "updateOne", "updateMany", "findOneAndUpdate", "insertMany", "bulkWrite"].map((m) => vi.spyOn(Listing, m));
    await get({ url: P17, title: "Apple iPhone 17", price: "400000" });
    const reads = Listing.find.mock.calls.length;
    const again = await get({ url: P17, title: "Apple iPhone 17", price: "400000" });
    expect(again.body.found).toBe(true);
    expect(Listing.find.mock.calls.length).toBe(reads);
    expect(fetchAndRefreshListings).not.toHaveBeenCalled();
    for (const spy of write) expect(spy).not.toHaveBeenCalled();
  });

  it("is not taken for a listing id by GET /:id", async () => {
    const { res, body } = await get({ url: P17 });
    expect(res.status).toBe(200);
    expect(body.matchedBy).toBe("url");
  });
});
