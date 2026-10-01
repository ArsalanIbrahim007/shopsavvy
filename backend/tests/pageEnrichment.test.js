import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { extractColourOptions } from "../src/services/colourPage.service.js";
import { enrichFromPages, enrichPta, interleaveByStore, PAGE_CATEGORIES, RECHECK_DAYS } from "../src/services/pageEnrichment.service.js";

// Small stand-ins for the real pages read on 2026-10-01. Stores embed JSON with escaped slashes, so the fixtures do too.
const page = (body, head = "<title>Samsung Galaxy A17 Price in Pakistan</title>") => `<html><head>${head}</head><body>${body}</body></html>`;
const embedded = (value) => `<script>${JSON.stringify(value).replace(/\//g, "\\/")}</script>`;

const ISHOPPING = page(`<h1>Samsung Galaxy A17</h1>${embedded({
  jsonSwatchConfig: { 968: {
    9560: { type: 2, value: "https://shop.example/black.jpg", thumb: "https://shop.example/black-thumb.jpg", label: "Black" },
    9311: { type: 2, value: "https://shop.example/grey.jpg", label: "Grey" },
  } },
  attributes: {
    968: { id: "968", code: "color", label: "Color", options: [{ id: "9560", label: "Black", products: ["1"] }, { id: "9311", label: "Grey", products: ["3"] }, { id: "9312", label: "Light Blue", products: ["4"] }], position: "0" },
    2212: { id: "2212", code: "pta_approved", label: "PTA Status", options: [{ id: "10390", label: "PTA Approved", products: ["1"] }], position: "1" },
  },
})}`);

const PRICEOYE = page(`<h1>Samsung Galaxy A17</h1><ul class="colors"><li class="active"><a data-tooltip data-tooltip-template="black"><div><img src="https://img.example/black-100x100.webp"></div></a></li><li><a data-tooltip-template="gray"><img src="https://img.example/grey-100x100.webp"></a></li></ul>${embedded({ summaryAttributes: { approved: { title: "PTA Approved" } }, charger_addon: [{ color: "white" }] })}`);

const TELEMART = page(embedded({
  variants: [
    { title: "6GB/128GB / Black", option1: "6GB/128GB", option2: "Black", featured_image: { id: 1, src: "//cdn.example/black.jpg?v=1" } },
    { title: "6GB/128GB / Ice Blue", option1: "6GB/128GB", option2: "Ice Blue", featured_image: { id: 2, src: "//cdn.example/blue.jpg?v=1" } },
    { title: "8GB/256GB / Black", option1: "8GB/256GB", option2: "Black", featured_image: null },
  ],
  options: ["6GB/128GB", "Black"],
}));

const names = (choices) => choices.map((c) => c.colour);

describe("extractColourOptions", () => {
  it("reads a Magento colour attribute, mapping shades to the colour names used elsewhere", () => {
    expect(names(extractColourOptions(ISHOPPING))).toEqual(["Black", "Grey", "Blue"]); // "Light Blue" is Blue
  });

  it("gives each colour its picture: Magento swatches (the thumbnail first), PriceOye thumbnails, Shopify variant images", () => {
    expect(extractColourOptions(ISHOPPING)).toEqual([
      { colour: "Black", image: "https://shop.example/black-thumb.jpg" },
      { colour: "Grey", image: "https://shop.example/grey.jpg" },
      { colour: "Blue", image: null }, // no swatch picture for this one: still a choice
    ]);
    expect(extractColourOptions(PRICEOYE)).toEqual([
      { colour: "Black", image: "https://img.example/black-100x100.webp" },
      { colour: "Grey", image: "https://img.example/grey-100x100.webp" },
    ]);
    expect(extractColourOptions(TELEMART)).toEqual([
      { colour: "Black", image: "https://cdn.example/black.jpg?v=1" }, // "//host/..." becomes https; the first picture wins
      { colour: "Blue", image: "https://cdn.example/blue.jpg?v=1" },
    ]);
  });

  it("only accepts web addresses as pictures", () => {
    const bad = page(`<ul class="colors"><li><a data-tooltip-template="black"><img src="javascript:alert(1)"></a></li><li><a data-tooltip-template="grey"><img src="data:image/png;base64,AAAA"></a></li></ul>`);
    expect(extractColourOptions(bad)).toEqual([{ colour: "Black", image: null }, { colour: "Grey", image: null }]);
  });

  it("reads PriceOye's marketing names written with underscores (refined_silver, cosmic_orange, deep_blue)", () => {
    const iphone = page(`<ul class="colors">${["refined_silver", "cosmic_orange", "deep_blue"].map((c) => `<li><a data-tooltip-template="${c}">x</a></li>`).join("")}</ul>`);
    expect(names(extractColourOptions(iphone))).toEqual(["Silver", "Orange", "Blue"]);
  });

  it("reads PriceOye's colour swatches, and not the colours of the add-on chargers", () => {
    expect(names(extractColourOptions(PRICEOYE))).toEqual(["Black", "Grey"]);
  });

  it("reads Shopify variant options, keeping only the ones that are colours", () => {
    expect(names(extractColourOptions(TELEMART))).toEqual(["Black", "Blue"]); // "6GB/128GB" is not a colour; "Ice Blue" is Blue
  });

  it("does not give one variant the picture of the next", () => {
    const html = page(embedded({ variants: [{ option1: "Black", featured_image: null }, { option1: "Blue", featured_image: { src: "//cdn.example/blue.jpg" } }] }));
    expect(extractColourOptions(html)).toEqual([{ colour: "Black", image: null }, { colour: "Blue", image: "https://cdn.example/blue.jpg" }]);
  });

  it("ignores a Magento attribute that is not the colour", () => {
    const other = page(embedded({ id: "1", code: "memory", label: "Memory", options: [{ label: "Black edition" }, { label: "Red" }] }));
    expect(extractColourOptions(other)).toEqual([]);
  });

  it("does not take colours from loose text, related products or styles", () => {
    const loose = page(`<h1>Samsung Galaxy A17</h1><p>Available in Black, Blue and Silver</p><section>Related: iPhone 17 Orange</section><style>.a{color:red}</style>`);
    expect(extractColourOptions(loose)).toEqual([]);
  });

  it("gives nothing for a page that lists more colours than one product has, and for empty input", () => {
    const many = page(`<ul class="colors">${["black", "white", "silver", "gold", "grey", "blue", "green", "red", "pink", "purple", "yellow", "orange", "teal"].map((c) => `<li><a data-tooltip-template="${c}">x</a></li>`).join("")}</ul>`);
    expect(extractColourOptions(many)).toEqual([]);
    expect(extractColourOptions("")).toEqual([]);
    expect(extractColourOptions(undefined)).toEqual([]);
  });

  it("lists each colour once, in the order the page gives them, keeping the first picture it finds", () => {
    const repeated = page(`<ul class="colors"><li><a data-tooltip-template="blue">x</a></li><li><a data-tooltip-template="black">x</a></li><li><a data-tooltip-template="blue"><img src="https://img.example/blue.webp"></a></li></ul>`);
    expect(extractColourOptions(repeated)).toEqual([{ colour: "Blue", image: "https://img.example/blue.webp" }, { colour: "Black", image: null }]);
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

describe("enrichFromPages", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const row = (id, platform, over = {}) => ({ _id: id, platform, title: "Samsung Galaxy A17", productCategory: "smartphone", ptaStatus: "unknown", productUrl: `https://${platform}.example/${id}`, ...over });

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

  it("asks for the categories where colour or PTA matters, that are active and were not read lately", async () => {
    model = modelReturning([]);
    await enrichFromPages({ model, now: NOW, delayMs: 0 });
    expect(PAGE_CATEGORIES).toEqual(["smartphone", "tablet", "smartwatch", "headphones", "laptop"]);
    expect(filterSeen).toMatchObject({ productCategory: { $in: PAGE_CATEGORIES }, isActive: true });
    expect(filterSeen.$or).toEqual([{ pageCheckedAt: null }, { pageCheckedAt: { $lt: new Date(NOW - RECHECK_DAYS * 86400000) } }]);
    await enrichFromPages({ model, now: NOW, delayMs: 0, stores: ["mega"] });
    expect(filterSeen.platform).toEqual({ $in: ["mega"] });
  });

  it("can be limited to titles containing some text, taken literally", async () => {
    model = modelReturning([]);
    await enrichFromPages({ model, now: NOW, delayMs: 0, match: "iphone 17 (pro)" });
    expect(filterSeen.title).toEqual({ $regex: "iphone 17 \\(pro\\)", $options: "i" });
    await enrichFromPages({ model, now: NOW, delayMs: 0 });
    expect(filterSeen).not.toHaveProperty("title");
  });

  it("saves the colours (with pictures) a page lists and the PTA status it states, and records that the page was read", async () => {
    model = modelReturning([row("a", "ishopping"), row("b", "priceoye"), row("c", "shophive")]);
    const pages = { a: ISHOPPING, b: PRICEOYE, c: page("<h1>nothing</h1>") };
    const summary = await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage: async (l) => pages[l._id] });

    expect(summary).toMatchObject({ checked: 3, approved: 2, unknown: 1, withColours: 2, failed: 0, dry: false });
    const byId = Object.fromEntries(updates);
    expect(byId.a).toMatchObject({ pageCheckedAt: new Date(NOW), ptaStatus: "pta_approved", ptaSource: "product_page" });
    expect(byId.a.colourOptions[0]).toEqual({ colour: "Black", image: "https://shop.example/black-thumb.jpg" });
    expect(names(byId.b.colourOptions)).toEqual(["Black", "Grey"]);
    expect(byId.c).toEqual({ pageCheckedAt: new Date(NOW) }); // nothing said: only remembered as read
  });

  it("does not touch a PTA status the title already gave, or work out PTA for a laptop, but still takes colours", async () => {
    model = modelReturning([
      row("a", "priceoye", { ptaStatus: "non_pta" }),
      row("b", "priceoye", { productCategory: "laptop" }),
    ]);
    const summary = await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage: async () => PRICEOYE });
    const byId = Object.fromEntries(updates);
    for (const id of ["a", "b"]) {
      expect(Object.keys(byId[id]).sort()).toEqual(["colourOptions", "pageCheckedAt"]);
      expect(names(byId[id].colourOptions)).toEqual(["Black", "Grey"]);
    }
    expect(summary).toMatchObject({ approved: 0, nonPta: 0, unknown: 0, withColours: 2 });
  });

  it("keeps an earlier colour answer when a page says nothing this time", async () => {
    model = modelReturning([row("a", "shophive")]);
    await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage: async () => page("<h1>nothing</h1>") });
    expect(Object.fromEntries(updates).a).not.toHaveProperty("colourOptions");
  });

  it("a dry run reads and reports but changes nothing", async () => {
    model = modelReturning([row("a", "ishopping")]);
    const summary = await enrichFromPages({ model, now: NOW, delayMs: 0, dry: true, fetchPage: async () => ISHOPPING });
    expect(summary).toMatchObject({ approved: 1, withColours: 1, dry: true });
    expect(names(summary.results[0].colours)).toEqual(["Black", "Grey", "Blue"]);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it("a page that cannot be read is skipped, tried again in two days, and does not stop the others", async () => {
    model = modelReturning([row("a", "ishopping"), row("b", "priceoye")]);
    const fetchPage = async (l) => { if (l._id === "a") throw new Error("HTTP 403"); return PRICEOYE; };
    const summary = await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage });
    expect(summary).toMatchObject({ checked: 1, failed: 1, approved: 1 });
    const byId = Object.fromEntries(updates);
    expect(byId.a).toEqual({ pageCheckedAt: new Date(NOW - (RECHECK_DAYS - 2) * 86400000) }); // due again after 2 days
    expect(byId.b.ptaStatus).toBe("pta_approved");
  });

  it("spreads the pages across stores instead of asking one store for several in a row", async () => {
    model = modelReturning([row("a1", "priceoye"), row("a2", "priceoye"), row("a3", "priceoye"), row("b1", "mega")]);
    const order = [];
    await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage: async (l) => { order.push(l._id); return "<html></html>"; } });
    expect(order).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("reads at most the limit, and pauses between pages", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`, `store${i}`));
    model = modelReturning(rows);
    const stamps = [];
    await enrichFromPages({ model, now: NOW, limit: 3, delayMs: 30, fetchPage: async () => { stamps.push(Date.now()); return "<html></html>"; } });
    expect(stamps).toHaveLength(3);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(25);
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(25);
  });

  it("is still available under its earlier name", () => {
    expect(enrichPta).toBe(enrichFromPages);
  });
});
