// GET /sitemap.xml (2026-10-26): the site's pages for search engines.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../src/services/catalogFeed.service.js", () => ({
  CATALOG_CATEGORIES: ["smartphone", "tv"],
  peekCatalogGroups: vi.fn(),
  getCatalogGroups: vi.fn(async () => { throw new Error("the sitemap must never compute a catalog"); }),
}));

import { getCatalogGroups, peekCatalogGroups } from "../src/services/catalogFeed.service.js";
import {
  clearSitemapCache, escapeXml, getSitemap, MAX_URLS, productPageOffer, sitemapEntries, sitemapXml,
} from "../src/services/sitemap.service.js";
import { createApp } from "../src/createApp.js";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const RECENT = "2026-10-25T21:00:00Z";
const SITE = "https://shopsavvy.example";

const offer = (id, platform, price, over = {}) => ({ _id: id, platform, price, inStock: true, lastScrapedAt: RECENT, ...over });
const group = (offers) => ({ productName: "Phone", offers });

const A17 = group([offer("a1", "priceoye", 64000), offer("a2", "mega", 63000), offer("a3", "mega", 65000)]);
const ONE_STORE = group([offer("s1", "shophive", 50000), offer("s2", "shophive", 51000)]); // two offers, one store: nothing to compare
const TV = group([offer("t1", "mega", 150000), offer("t2", "priceoye", 149000, { lastScrapedAt: "2026-10-20T08:00:00Z" })]);

describe("productPageOffer: the frontend's 'lowest price' rule, so the sitemap lists the address the page calls canonical", () => {
  it("is the cheapest offer in stock with a current price", () => {
    expect(productPageOffer(A17, NOW)._id).toBe("a2");
    const soldOut = group([offer("x1", "mega", 100, { inStock: false }), offer("x2", "priceoye", 200)]);
    expect(productPageOffer(soldOut, NOW)._id).toBe("x2");
    const old = group([offer("y1", "mega", 100, { lastScrapedAt: "2026-09-01T00:00:00Z" }), offer("y2", "priceoye", 200)]);
    expect(productPageOffer(old, NOW)._id).toBe("y2"); // a price not checked for two weeks does not lead
    expect(productPageOffer(group([]), NOW)).toBeNull();
  });

  it("passes over an unusual price, a phone priced like a non-PTA one, and a used unit", () => {
    const odd = group([offer("u1", "mega", 6400, { priceCheck: { status: "suspect_low" } }), offer("u2", "priceoye", 64000)]);
    expect(productPageOffer(odd, NOW)._id).toBe("u2");
    const pta = group([offer("v1", "mega", 50000, { ptaAssessment: "likely_non_pta" }), offer("v2", "priceoye", 64000)]);
    expect(productPageOffer(pta, NOW)._id).toBe("v2");
    const used = group([offer("w1", "mega", 40000, { condition: "used" }), offer("w2", "priceoye", 64000, { condition: "new" })]);
    expect(productPageOffer(used, NOW)._id).toBe("w2");
  });

  it("still names an offer when every one is out of stock or pre-owned", () => {
    expect(productPageOffer(group([offer("z1", "mega", 300, { inStock: false }), offer("z2", "priceoye", 200, { inStock: false })]), NOW)._id).toBe("z2");
    expect(productPageOffer(group([offer("r1", "mega", 300, { condition: "refurbished" })]), NOW)._id).toBe("r1");
  });
});

describe("sitemapEntries", () => {
  const entries = sitemapEntries({ smartphone: [A17, ONE_STORE], tv: [TV] }, { site: SITE, now: NOW });
  const locs = entries.map((e) => e.loc);

  it("lists the fixed pages and each category's page", () => {
    expect(locs.slice(0, 4)).toEqual([`${SITE}/`, `${SITE}/drops`, `${SITE}/how-it-works`, `${SITE}/honest-prices`]);
    expect(locs).toContain(`${SITE}/results?category=smartphone`);
    expect(locs).toContain(`${SITE}/results?category=tv`);
  });

  it("lists one page per product that at least two stores sell, at its cheapest offer", () => {
    expect(locs.filter((loc) => loc.includes("/product/"))).toEqual([`${SITE}/product/a2`, `${SITE}/product/t2`]);
  });

  it("dates a product by when its prices were last checked", () => {
    expect(entries.find((e) => e.loc.endsWith("/product/a2")).lastmod).toBe("2026-10-25");
    expect(entries.find((e) => e.loc.endsWith("/product/t2")).lastmod).toBe("2026-10-25"); // the newer of its two offers
    expect(entries[0].lastmod).toBe("2026-10-26");
  });

  it("never lists one page twice, and never more than the protocol allows", () => {
    const twice = sitemapEntries({ smartphone: [A17, A17] }, { site: SITE, now: NOW });
    expect(twice.filter((e) => e.loc.endsWith("/product/a2"))).toHaveLength(1);
    const many = Array.from({ length: MAX_URLS + 10 }, (_, i) => group([offer(`m${i}`, "mega", 1), offer(`p${i}`, "priceoye", 2)]));
    expect(sitemapEntries({ smartphone: many }, { site: SITE, now: NOW })).toHaveLength(MAX_URLS);
  });
});

describe("sitemapXml", () => {
  it("writes a sitemaps.org document, escaping what XML needs escaped", () => {
    expect(escapeXml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
    const xml = sitemapXml([{ loc: `${SITE}/results?category=tv&x=1`, lastmod: "2026-10-26", changefreq: "daily", priority: "0.7" }]);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    expect(xml).toContain("<url><loc>https://shopsavvy.example/results?category=tv&amp;x=1</loc><lastmod>2026-10-26</lastmod>");
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("GET /sitemap.xml", () => {
  let server;
  let url;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  const bothReady = (category) => ({ groups: category === "tv" ? [TV] : [A17] });
  beforeEach(() => {
    clearSitemapCache();
    vi.mocked(getCatalogGroups).mockClear();
    vi.mocked(peekCatalogGroups).mockReset().mockImplementation(bothReady);
  });

  it("serves XML at the site's address, cached for an hour", async () => {
    const res = await fetch(`${url}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/xml/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const xml = await res.text();
    expect(xml).toContain("<loc>http://localhost:5173/product/a2</loc>"); // PUBLIC_SITE_URL not set: the local frontend
  });

  it("never computes a catalog: a category not computed yet is left out, and that sitemap is kept five minutes", async () => {
    // Live, 2026-10-26: computing them on request at start-up timed the grouping worker out (500 after 95 s).
    vi.mocked(peekCatalogGroups).mockImplementation((category) => (category === "tv" ? null : bothReady(category)));
    const res = await fetch(`${url}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const xml = await res.text();
    expect(xml).toContain("/product/a2</loc>");
    expect(xml).not.toContain("category=tv");
    expect(getCatalogGroups).not.toHaveBeenCalled();
  });

  it("builds once an hour when complete, and again within minutes when a category was missing", () => {
    getSitemap({ now: NOW, env: { PUBLIC_SITE_URL: SITE } });
    getSitemap({ now: NOW + 30 * 60 * 1000, env: { PUBLIC_SITE_URL: SITE } });
    expect(peekCatalogGroups).toHaveBeenCalledTimes(2); // two categories, once
    getSitemap({ now: NOW + 61 * 60 * 1000, env: { PUBLIC_SITE_URL: SITE } });
    expect(peekCatalogGroups).toHaveBeenCalledTimes(4);

    clearSitemapCache();
    vi.mocked(peekCatalogGroups).mockClear().mockImplementation((category) => (category === "tv" ? null : bothReady(category)));
    expect(getSitemap({ now: NOW, env: {} }).missing).toEqual(["tv"]);
    vi.mocked(peekCatalogGroups).mockImplementation(bothReady); // the warm-up finished
    expect(getSitemap({ now: NOW + 4 * 60 * 1000, env: {} }).missing).toEqual(["tv"]); // still the short-lived one
    expect(getSitemap({ now: NOW + 6 * 60 * 1000, env: {} }).missing).toEqual([]);
  });

  it("uses PUBLIC_SITE_URL for the addresses", () => {
    const { xml } = getSitemap({ now: NOW, env: { PUBLIC_SITE_URL: "https://shopsavvy.example/" } });
    expect(xml).toContain("<loc>https://shopsavvy.example/product/a2</loc>");
    expect(xml).not.toContain("localhost");
  });
});
