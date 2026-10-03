import { describe, it, expect } from "vitest";

import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { extractPtaStatus } from "../src/services/productAttributes.service.js";

// The real case, found 2026-10-03: Mega's page says its bare-titled "Apple iPhone 17" is non-PTA (the nightly page read stored
// ptaStatus "non_pta"), but matching only looked at the TITLE, so the PKR 284,999 non-PTA unit joined the PTA-approved product and
// became its "lowest price" and "best deal". 10 real products were affected.

let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone",
  ptaStatus: extractPtaStatus(title), inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [], ...over,
});
const fromPage = (status) => ({ ptaStatus: status, ptaSource: "product_page" });

const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const groupOf = (groups, offer) => groups.find((g) => g.offers.some((o) => o._id === offer._id));
const together = (groups, a, b) => groupOf(groups, a) === groupOf(groups, b);

describe("a PTA status read from the store's page", () => {
  const approved = () => [
    listing("mega", "Apple iPhone 17 256GB Storage PTA Approved", 369999),
    listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999),
    listing("telemart", "Apple iPhone 17 256GB PTA Approved With Official Warranty", 397999),
  ];

  it("keeps a bare-titled offer the page calls non-PTA out of the PTA-approved product", () => {
    const [a, b, c] = approved();
    const bare = listing("mega", "Apple iPhone 17 256GB", 284999, fromPage("non_pta"));
    const groups = group([a, b, c, bare]);
    expect(together(groups, a, bare)).toBe(false);
    expect(together(groups, a, b)).toBe(true);
    const product = groupOf(groups, a);
    expect(product.offers.map((o) => o.price)).not.toContain(284999);
    expect(product.lowestPrice).toBe(369999);
    expect(product.bestDeal.price).toBeGreaterThanOrEqual(369999);
  });

  it("keeps the non-PTA offer out however early it is listed (the order must not matter)", () => {
    const [a, b, c] = approved();
    const bare = listing("mega", "Apple iPhone 17 256GB", 284999, fromPage("non_pta"));
    for (const order of [[bare, a, b, c], [a, bare, b, c], [a, b, bare, c], [a, b, c, bare]]) {
      const groups = group(order);
      expect(together(groups, bare, a), order.map((l) => l.price).join()).toBe(false);
    }
  });

  it("keeps two bare-titled offers apart when their pages disagree, and together when they agree", () => {
    const yes = listing("priceoye", "Apple Iphone 17 256GB", 384999, fromPage("pta_approved"));
    const no = listing("mega", "Apple iPhone 17 256GB", 284999, fromPage("non_pta"));
    const alsoNo = listing("ishopping", "Apple iPhone 17 256GB", 289999, fromPage("non_pta"));
    const alsoYes = listing("ishopping", "Apple iPhone 17 256GB Mercantile Warranty", 389999, fromPage("pta_approved"));
    const groups = group([yes, no, alsoNo, alsoYes]);
    expect(together(groups, yes, no)).toBe(false);
    expect(together(groups, yes, alsoYes)).toBe(true);
    expect(together(groups, no, alsoNo)).toBe(true);
  });

  it("never splits on silence: an offer whose title and page say nothing still joins", () => {
    const [a, b] = approved();
    const quiet = listing("priceoye", "Apple iPhone 17 256GB", 384999); // ptaStatus unknown
    const groups = group([a, b, quiet]);
    expect(together(groups, a, quiet)).toBe(true);
    expect(groupOf(groups, quiet).offers.find((o) => o._id === quiet._id).ptaAssessment).toBe("not_stated");
  });

  it("does not let an unstated offer bridge a non-PTA unit into an approved product", () => {
    const [a] = approved();
    const quiet = listing("priceoye", "Apple iPhone 17 256GB", 384999); // says nothing
    const no = listing("mega", "Apple iPhone 17 256GB", 380000, fromPage("non_pta")); // priced like the approved ones, so not caught by price
    for (const order of [[quiet, no, a], [quiet, a, no], [a, quiet, no]]) {
      const groups = group(order);
      expect(together(groups, no, a), order.map((l) => l.platform).join()).toBe(false);
    }
  });

  it("trusts what the title states over an older stored status", () => {
    const [a] = approved();
    const titleSaysApproved = listing("mega", "Apple iPhone 17 256GB PTA Approved", 372000, fromPage("non_pta")); // page read was wrong or old
    const titleSaysNon = listing("shophive", "Apple iPhone 17 256GB Non PTA", 280000, fromPage("pta_approved"));
    const groups = group([a, titleSaysApproved, titleSaysNon]);
    expect(together(groups, a, titleSaysApproved)).toBe(true);
    expect(together(groups, a, titleSaysNon)).toBe(false);
  });

  it("applies to tablets as well as phones, and to the rule matcher as well as the trained one", () => {
    const tablet = (platform, title, price, over) => listing(platform, title, price, { productCategory: "tablet", ...over });
    const a = tablet("mega", "Apple iPad Air 11 M3 256GB PTA Approved", 220000);
    const bare = tablet("priceoye", "Apple iPad Air 11 M3 256GB", 160000, fromPage("non_pta"));
    expect(together(group([a, bare]), a, bare)).toBe(false);
    const ruleGroups = groupListingsByProduct([a, bare]);
    expect(together(ruleGroups, a, bare)).toBe(false);
  });

  it("leaves a group of non-PTA offers together, with its own PTA status", () => {
    const one = listing("mega", "Apple iPhone 17 256GB", 284999, fromPage("non_pta"));
    const two = listing("ishopping", "Apple iPhone 17 256GB", 289999, fromPage("non_pta"));
    const [product] = group([one, two]);
    expect(product.offers).toHaveLength(2);
    expect(product.ptaStatus).toBe("non_pta");
  });

  it("gives the same answer for the same listings in any order", () => {
    const [a, b, c] = approved();
    const bare = listing("mega", "Apple iPhone 17 256GB", 284999, fromPage("non_pta"));
    const sizes = (groups) => groups.map((g) => g.offers.length).sort().join();
    expect(sizes(group([bare, a, b, c]))).toBe(sizes(group([c, b, a, bare])));
  });
});
