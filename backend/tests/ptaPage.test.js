import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { classify, extractPtaFromPage } from "../src/services/ptaPage.service.js";
import { enrichPta, interleaveByStore, RECHECK_DAYS } from "../src/services/ptaEnrichment.service.js";
import { toListingDoc } from "../src/services/scraper.service.js";

// Pages are small stand-ins for the real ones read on 2026-10-01 (iShopping, PriceOye, and stores that say nothing).
const page = (body, head = "<title>Samsung Galaxy A17 Price in Pakistan</title>") => `<html><head>${head}</head><body>${body}</body></html>`;

const ISHOPPING = page(`<h1>Samsung Galaxy A17</h1><script>var cfg = {"attributes":{"2212":{"id":"2212","code":"pta_approved","label":"PTA Status","options":[{"id":"10390","label":"PTA Approved","products":["649524","649525"]}],"position":"1"},"1010":{"id":"1010","code":"memory_ram","label":"Memory/Ram","options":[{"id":"9533","label":"128GB - 6GB RAM","products":["649524"]}]}}};</script>`);
const PRICEOYE = page(`<h1>Samsung Galaxy A17</h1><script>{"summaryAttributes":{"approved":{"title":"PTA Approved","key":"","icon":"feature-approved.svg"}}}</script>`);

describe("classify", () => {
  it("reads PTA approved and non-PTA wording, and nothing else", () => {
    expect(classify("Apple iPhone 17 256GB PTA Approved")).toBe("pta_approved");
    expect(classify("Apple iPhone 17 NON PTA")).toBe("non_pta");
    expect(classify("Apple iPhone 17 Non-PTA")).toBe("non_pta");
    expect(classify("PTA not approved")).toBe("non_pta");
    expect(classify("Samsung Galaxy A17 Dual Sim With Official Warranty")).toBe("unknown");
    expect(classify("")).toBe("unknown");
    expect(classify(undefined)).toBe("unknown");
  });
});

describe("extractPtaFromPage", () => {
  it("reads iShopping's attribute list ('PTA Status': 'PTA Approved')", () => {
    expect(extractPtaFromPage(ISHOPPING)).toEqual({ status: "pta_approved", evidence: "PTA Status: PTA Approved", source: "attribute list" });
  });

  it("reads PriceOye's PTA Approved badge", () => {
    expect(extractPtaFromPage(PRICEOYE)).toMatchObject({ status: "pta_approved", source: "summary badge" });
  });

  it("reads a specification table row, with yes or no", () => {
    const yes = page("<table><tr><th>Brand</th><td>Samsung</td></tr><tr><th>PTA Approved</th><td>Yes</td></tr></table>");
    expect(extractPtaFromPage(yes)).toEqual({ status: "pta_approved", evidence: "PTA Approved: Yes", source: "specification" });
    const no = page("<table><tr><th>PTA Approved</th><td>No</td></tr></table>");
    expect(extractPtaFromPage(no)).toMatchObject({ status: "non_pta", source: "specification" });
    const word = page("<table><tr><td>PTA Status</td><td>Non PTA</td></tr></table>");
    expect(extractPtaFromPage(word).status).toBe("non_pta");
  });

  it("reads definition lists and 'label: value' list items", () => {
    expect(extractPtaFromPage(page("<dl><dt>PTA</dt><dd>Approved</dd></dl>")).status).toBe("pta_approved");
    expect(extractPtaFromPage(page("<ul><li>Storage: 128GB</li><li>PTA Status: Not Approved</li></ul>")).status).toBe("non_pta");
  });

  it("reads the page's own title, heading and description", () => {
    expect(extractPtaFromPage(page("<h1>Apple iPhone 17 PTA Approved</h1>", "<title>iPhone 17</title>"))).toMatchObject({ status: "pta_approved", source: "page title or description" });
    expect(extractPtaFromPage(page("<p>x</p>", '<title>iPhone 17</title><meta name="description" content="Buy iPhone 17 NON PTA at the best price">')).status).toBe("non_pta");
    const ld = page("", `<script type="application/ld+json">{"@type":"Product","name":"Samsung Galaxy A17 PTA Approved"}</script>`);
    expect(extractPtaFromPage(ld).status).toBe("pta_approved");
  });

  it("reads the product's own gallery image titles, but only those that name this product", () => {
    const gallery = page(`<img alt="iShopping - Samsung Galaxy A17-Black-PTA Approved-128GB">`);
    expect(extractPtaFromPage(gallery, { productName: "Samsung Galaxy A17" })).toMatchObject({ status: "pta_approved", source: "product images" });
    expect(extractPtaFromPage(gallery, { productName: "Apple iPhone 17" }).status).toBe("unknown"); // another product's image
    expect(extractPtaFromPage(gallery).status).toBe("unknown"); // no name to recognise it by
  });

  it("does not take PTA wording from elsewhere on the page, such as related products", () => {
    const related = page("<h1>Samsung Galaxy A17</h1><section><h3>Related</h3><p>Apple iPhone 16 PTA Approved</p><p>Apple iPhone 17 NON PTA</p></section>");
    expect(extractPtaFromPage(related)).toEqual({ status: "unknown", evidence: null, source: null });
  });

  it("says unknown when the page names both a PTA and a non-PTA version", () => {
    const both = page(`<script>{"label":"PTA Status","options":[{"label":"PTA Approved"},{"label":"Non PTA"}]}</script>`);
    const out = extractPtaFromPage(both);
    expect(out.status).toBe("unknown");
    expect(out.evidence).toMatch(/^mixed:/);
  });

  it("prefers a specification over what the title says", () => {
    const spec = page("<table><tr><th>PTA Approved</th><td>No</td></tr></table>", "<title>Phone PTA Approved</title>");
    expect(extractPtaFromPage(spec).status).toBe("non_pta");
  });

  it("says unknown for a page that says nothing, and for empty or missing input", () => {
    expect(extractPtaFromPage(page("<h1>Samsung Galaxy A17</h1><p>Official warranty</p>"))).toEqual({ status: "unknown", evidence: null, source: null });
    expect(extractPtaFromPage("")).toEqual({ status: "unknown", evidence: null, source: null });
    expect(extractPtaFromPage(undefined).status).toBe("unknown");
    expect(extractPtaFromPage("<<<not html").status).toBe("unknown");
  });
});

describe("interleaveByStore", () => {
  it("never asks one store twice in a row while another store is waiting", () => {
    const listing = (platform, n) => ({ platform, n });
    const out = interleaveByStore([listing("a", 1), listing("a", 2), listing("a", 3), listing("b", 1), listing("c", 1)]);
    expect(out.map((l) => `${l.platform}${l.n}`)).toEqual(["a1", "b1", "c1", "a2", "a3"]);
    expect(interleaveByStore([])).toEqual([]);
  });
});

describe("enrichPta", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const row = (id, platform, title = "Samsung Galaxy A17") => ({ _id: id, platform, title, productUrl: `https://${platform}.example/${id}` });

  let updates;
  let filterSeen;
  let model;
  const modelReturning = (rows) => ({
    find: vi.fn((filter) => {
      filterSeen = filter;
      return { sort: () => ({ limit: (n) => ({ lean: async () => rows.slice(0, n) }) }) };
    }),
    updateOne: vi.fn(async (where, change) => { updates.push([where._id, change.$set]); }),
  });
  beforeEach(() => { updates = []; filterSeen = null; });
  afterEach(() => vi.restoreAllMocks());

  it("asks only for phones and tablets with no PTA status that have not been read lately", async () => {
    model = modelReturning([]);
    await enrichPta({ model, now: NOW, delayMs: 0 });
    expect(filterSeen).toMatchObject({ productCategory: { $in: ["smartphone", "tablet"] }, ptaStatus: "unknown", isActive: true });
    expect(filterSeen.$or).toEqual([{ ptaCheckedAt: null }, { ptaCheckedAt: { $lt: new Date(NOW - RECHECK_DAYS * 86400000) } }]);
    await enrichPta({ model, now: NOW, delayMs: 0, stores: ["mega"] });
    expect(filterSeen.platform).toEqual({ $in: ["mega"] });
  });

  it("saves what a page says, marks where it came from, and records that the page was read", async () => {
    model = modelReturning([row("a", "ishopping"), row("b", "priceoye"), row("c", "shophive")]);
    const pages = { a: ISHOPPING, b: page("<table><tr><th>PTA Approved</th><td>No</td></tr></table>"), c: page("<h1>nothing</h1>") };
    const summary = await enrichPta({ model, now: NOW, delayMs: 0, fetchPage: async (l) => pages[l._id] });

    expect(summary).toMatchObject({ checked: 3, approved: 1, nonPta: 1, unknown: 1, failed: 0, dry: false });
    const byId = Object.fromEntries(updates);
    expect(byId.a).toEqual({ ptaCheckedAt: new Date(NOW), ptaStatus: "pta_approved", ptaSource: "product_page" });
    expect(byId.b).toMatchObject({ ptaStatus: "non_pta", ptaSource: "product_page" });
    expect(byId.c).toEqual({ ptaCheckedAt: new Date(NOW) }); // nothing said: only remembered as read, status left alone
  });

  it("a dry run reads and reports but changes nothing", async () => {
    model = modelReturning([row("a", "ishopping")]);
    const summary = await enrichPta({ model, now: NOW, delayMs: 0, dry: true, fetchPage: async () => ISHOPPING });
    expect(summary).toMatchObject({ approved: 1, dry: true });
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it("a page that cannot be read is skipped, tried again in two days, and does not stop the others", async () => {
    model = modelReturning([row("a", "ishopping"), row("b", "priceoye")]);
    const fetchPage = async (l) => { if (l._id === "a") throw new Error("HTTP 403"); return PRICEOYE; };
    const summary = await enrichPta({ model, now: NOW, delayMs: 0, fetchPage });
    expect(summary).toMatchObject({ checked: 1, failed: 1, approved: 1 });
    const byId = Object.fromEntries(updates);
    expect(byId.a).toEqual({ ptaCheckedAt: new Date(NOW - (RECHECK_DAYS - 2) * 86400000) }); // due again after 2 days
    expect(byId.a.ptaStatus).toBeUndefined();
    expect(byId.b.ptaStatus).toBe("pta_approved");
  });

  it("spreads the pages across stores instead of asking one store for several in a row", async () => {
    model = modelReturning([row("a1", "priceoye"), row("a2", "priceoye"), row("a3", "priceoye"), row("b1", "mega")]);
    const order = [];
    await enrichPta({ model, now: NOW, delayMs: 0, fetchPage: async (l) => { order.push(l._id); return "<html></html>"; } });
    expect(order).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("reads at most the limit, and pauses between pages", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`, `store${i}`));
    model = modelReturning(rows);
    const stamps = [];
    await enrichPta({ model, now: NOW, limit: 3, delayMs: 30, fetchPage: async () => { stamps.push(Date.now()); return "<html></html>"; } });
    expect(stamps).toHaveLength(3);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(25);
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(25);
  });
});

describe("scraping does not undo what a product page said", () => {
  const scraped = (title) => ({ platform: "ishopping", title, price: 64299, sourceUrl: "https://www.ishopping.pk/samsung-galaxy-a17-price-in-pakistan" });

  it("leaves ptaStatus alone when the title says nothing", () => {
    const doc = toListingDoc(scraped("Samsung Galaxy A17"));
    expect(doc).not.toHaveProperty("ptaStatus");
    expect(doc).not.toHaveProperty("ptaSource");
  });

  it("writes the status a title states, and says it came from the title", () => {
    expect(toListingDoc(scraped("Samsung Galaxy A17 PTA Approved"))).toMatchObject({ ptaStatus: "pta_approved", ptaSource: "title" });
    expect(toListingDoc(scraped("Samsung Galaxy A17 NON PTA"))).toMatchObject({ ptaStatus: "non_pta", ptaSource: "title" });
  });
});
