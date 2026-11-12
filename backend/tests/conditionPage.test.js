// A used phone sold under a new phone's title (audit, 2026-11-12, finding 12): iShopping's "Apple iPhone 15 128GB PTA Approved" at
// PKR 173,400 beside new ones at 264,999 and up. Only its page says it is used.
import { describe, it, expect, vi } from "vitest";

import { extractConditionFromPage, MIN_SIGNS } from "../src/services/conditionPage.service.js";
import { CONDITION_STORES, enrichFromPages } from "../src/services/pageEnrichment.service.js";
import { toListingDoc } from "../src/services/scraper.service.js";

// The part of the real page (read 2026-11-12) that says it.
const USED_PAGE = `<main><h1>Apple iPhone 15 128GB PTA Approved</h1><span>Rs. 173,400.00</span>
  <ul><li>Condition: 10/10</li><li>Battery Health: 85%+ Boosted</li><li>7 Days Checking &amp; Replacement Warranty</li>
  <li>No Box Only Kit</li></ul><div>Sold by : LIKE NEW</div><p>Battery Type Li-Ion, non-removable</p></main>`;
const NEW_PAGE = `<main><h1>Apple iPhone 17 - Mercantile Warranty</h1><p>Battery: Li-Ion. Check battery health in Settings.</p>
  <nav><a href="/refurbished">Refurbished phones</a></nav></main>`;

describe("reading a used phone from its page", () => {
  it("finds the signs on the used iPhone's page", () => {
    const read = extractConditionFromPage(USED_PAGE);
    expect(read.condition).toBe("used");
    expect(read.evidence).toEqual(expect.arrayContaining(["condition score", "battery health", "no box", "checking warranty", "sold as like new"]));
  });

  it(`needs ${MIN_SIGNS} signs: a new phone's page that mentions battery health or links to refurbished phones is not used`, () => {
    expect(extractConditionFromPage(NEW_PAGE).condition).toBeNull();
    expect(extractConditionFromPage("<p>Battery Health: 100%</p>").condition).toBeNull();
  });
});

describe("the page check records it, and a scrape does not undo it", () => {
  const NOW = Date.parse("2026-11-12T12:00:00Z");
  const row = (over = {}) => ({ _id: "i1", platform: "ishopping", title: "Apple iPhone 15 128GB PTA Approved", productCategory: "smartphone", ptaStatus: "pta_approved", condition: "new", productUrl: "https://www.ishopping.pk/x", ...over });
  const run = async (listing, page) => {
    const updates = [];
    const model = {
      find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [listing] }) }) }),
      updateOne: vi.fn(async (where, change) => { updates.push(change.$set); }),
    };
    await enrichFromPages({ model, now: NOW, delayMs: 0, fetchPage: async () => page, readSpecs: async () => null });
    return updates[0];
  };

  it("marks an iShopping phone whose page shows it used as used, from the page", async () => {
    expect(CONDITION_STORES.has("ishopping")).toBe(true);
    expect(await run(row(), USED_PAGE)).toMatchObject({ condition: "used", conditionSource: "product_page" });
  });

  it("sets it back to new when a later read shows a new phone; never touches a condition the title states", async () => {
    expect(await run(row({ condition: "used", conditionSource: "product_page" }), NEW_PAGE)).toMatchObject({ condition: "new", conditionSource: null });
    const fromTitle = await run(row({ title: "Apple iPhone 15 128GB Refurbished", condition: "refurbished", conditionSource: "title" }), NEW_PAGE);
    expect(fromTitle).not.toHaveProperty("condition");
  });

  it("only reads the condition at the stores checked for it", async () => {
    expect(await run(row({ platform: "priceoye" }), USED_PAGE)).not.toHaveProperty("condition");
  });

  it("a scrape whose title says nothing leaves the condition alone; one that states it writes it", () => {
    const scraped = (title) => ({ platform: "ishopping", title, price: 173400, sourceUrl: "https://www.ishopping.pk/x" });
    expect(toListingDoc(scraped("Apple iPhone 15 128GB PTA Approved"))).not.toHaveProperty("condition");
    expect(toListingDoc(scraped("Apple iPhone 15 128GB Used"))).toMatchObject({ condition: "used", conditionSource: "title" });
  });
});
