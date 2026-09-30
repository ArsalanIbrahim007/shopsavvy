import { describe, it, expect } from "vitest";

import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { extractPtaStatus } from "../src/services/productAttributes.service.js";

let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone",
  ptaStatus: extractPtaStatus(title), inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [], ...over,
});

// The real case (Arsalan, 2026-10-01): PTA-approved iPhone 17 at PKR 370,000 to 398,000, and a store listing
// the bare title "Apple iPhone 17" at PKR 284,999 that became the page's "best deal".
const iphone17 = () => [
  listing("mega", "Apple iPhone 17 256GB Storage PTA Approved", 369999),
  listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999),
  listing("telemart", "Apple iPhone 17 PTA Approved With Official Warranty", 397999),
  listing("priceoye", "Apple Iphone 17", 384999), // unstated, close to the PTA prices
  listing("mega", "Apple iPhone 17", 284999), // unstated, far below them
];

const titlesOf = (group) => group.offers.map((o) => `${o.platform}:${o.title}`).sort();
const groupWith = (groups, title) => groups.find((g) => g.offers.some((o) => o.title === title));

// The trained matcher is what search, product pages and the catalog use; the rule matcher only builds the nightly
// query list, where a mistake costs one extra query, so it gets one invariant check below.
describe("PTA separation", () => {
  const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });

  it("takes an unstated offer priced far below the PTA-approved ones out of their product", () => {
    const groups = group(iphone17());
    const pta = groupWith(groups, "Apple iPhone 17 256GB PTA Approved");
    expect(titlesOf(pta)).not.toContain("mega:Apple iPhone 17");
    expect(pta.offerCount).toBe(4);
    expect(pta.lowestPrice).toBe(369999);

    const cheap = groupWith(groups, "Apple iPhone 17");
    expect(cheap.offers.filter((o) => o.platform === "mega")).toHaveLength(1);
    expect(cheap.offers[0].price).toBe(284999);
    expect(cheap.offers[0].ptaAssessment).toBe("likely_non_pta");
    expect(cheap.ptaStatus).toBe("likely_non_pta");
  });

  it("the PTA product's best deal is an offer that says PTA approved, and the cheap offer cannot be it", () => {
    const pta = groupWith(group(iphone17()), "Apple iPhone 17 256GB PTA Approved");
    expect(pta.ptaStatus).toBe("pta_approved");
    expect(pta.bestDeal.ptaStatus).toBe("pta_approved");
    expect(pta.bestDeal.price).toBeGreaterThanOrEqual(369999);
  });

  it("an unstated offer slightly cheaper than the PTA ones stays in the list but does not become the best deal", () => {
    const groups = group([...iphone17(), listing("ishopping", "Apple iPhone 17 - Mercantile Warranty", 360000)]);
    const pta = groupWith(groups, "Apple iPhone 17 256GB PTA Approved");
    const unstated = pta.offers.find((o) => o.platform === "ishopping");
    expect(unstated.ptaAssessment).toBe("not_stated");
    expect(unstated.price).toBeLessThan(pta.bestDeal.price);
    expect(pta.bestDeal.ptaStatus).toBe("pta_approved");
  });

  it("keeps an unstated offer that is priced like the PTA ones, and labels it 'not stated'", () => {
    const pta = groupWith(group(iphone17()), "Apple iPhone 17 256GB PTA Approved");
    const unstated = pta.offers.find((o) => o.platform === "priceoye");
    expect(unstated.ptaAssessment).toBe("not_stated");
    expect(pta.offers.filter((o) => o.ptaAssessment).length).toBe(1);
  });

  it("gives the same answer whatever order the listings arrive in", () => {
    const base = iphone17();
    const shape = (groups) => groups.map((g) => titlesOf(g)).sort((a, b) => a[0].localeCompare(b[0]));
    const expected = shape(group(base));
    for (const order of [[...base].reverse(), [base[4], base[0], base[3], base[1], base[2]], [base[3], base[4], base[2], base[0], base[1]]]) {
      expect(shape(group(order))).toEqual(expected);
    }
  });

  it("joins a matching NON PTA product when there is one, instead of starting another", () => {
    const groups = group([
      ...iphone17(),
      listing("mega", "Apple iPhone 17 256GB Storage NON PTA", 289999),
    ]);
    const nonPta = groupWith(groups, "Apple iPhone 17 256GB Storage NON PTA");
    expect(titlesOf(nonPta)).toEqual(["mega:Apple iPhone 17", "mega:Apple iPhone 17 256GB Storage NON PTA"]);
    expect(nonPta.ptaStatus).toBe("non_pta");
    expect(groups.filter((g) => g.offers.some((o) => o.platform === "mega" && o.price < 300000))).toHaveLength(1);
  });

  it("does not touch an unstated offer when no offer states PTA approval, or for other categories", () => {
    const noPta = group([
      listing("mega", "Apple iPhone 17", 284999),
      listing("priceoye", "Apple Iphone 17", 384999),
    ]);
    expect(noPta).toHaveLength(1);
    expect(noPta[0].offers.some((o) => o.ptaAssessment)).toBe(false);
    expect(noPta[0].ptaStatus).toBe("unknown");

    const laptops = group([
      listing("mega", "Dell Inspiron 15 Core i5 16GB 512GB", 100000, { productCategory: "laptop" }),
      listing("priceoye", "Dell Inspiron 15 Core i5 16GB 512GB PTA Approved", 140000, { productCategory: "laptop" }),
    ]);
    expect(laptops.flatMap((g) => g.offers).some((o) => o.ptaAssessment)).toBe(false);
  });

  it("uses a 15% gap: exactly 15% below stays, more than that moves", () => {
    const at = (price) => group([
      listing("mega", "Apple iPhone 17 256GB Storage PTA Approved", 400000),
      listing("shophive", "Apple iPhone 17 256GB PTA Approved", 410000),
      listing("priceoye", "Apple Iphone 17", price),
    ]);
    expect(at(340000)).toHaveLength(1); // 15% below the cheapest PTA offer
    expect(at(339000)).toHaveLength(2);
  });

  it("keeps the recorded PTA status of an offer whose title says nothing", () => {
    const groups = group([
      listing("mega", "Apple iPhone 17 256GB Storage PTA Approved", 369999),
      listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999),
      listing("priceoye", "Apple Iphone 17", 250000, { ptaStatus: "pta_approved" }), // the store data says approved
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].offers.find((o) => o.platform === "priceoye").ptaAssessment).toBeUndefined();
  });

  it("reads PTA approval from the title first, so an out-of-date stored status cannot hide it", () => {
    const groups = group([
      listing("mega", "Apple iPhone 17 256GB Storage PTA Approved", 369999, { ptaStatus: "unknown" }),
      listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999, { ptaStatus: "unknown" }),
      listing("priceoye", "Apple Iphone 17", 284999),
    ]);
    const pta = groupWith(groups, "Apple iPhone 17 256GB PTA Approved");
    expect(pta.ptaStatus).toBe("pta_approved");
    expect(pta.offerCount).toBe(2);
  });

  it("only labels; an offer's own data is untouched and inputs are not modified", () => {
    const input = iphone17();
    const copy = JSON.parse(JSON.stringify(input));
    const groups = group(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(copy);
    const moved = groupWith(groups, "Apple iPhone 17").offers[0];
    expect(moved).toMatchObject({ platform: "mega", price: 284999, title: "Apple iPhone 17", ptaStatus: "unknown" });
  });

  it("collects several far-cheaper unstated offers from different stores into one group", () => {
    const groups = group([
      ...iphone17(),
      listing("ishopping", "Apple iPhone 17", 288000),
    ]);
    const cheap = groups.find((g) => g.ptaStatus === "likely_non_pta");
    expect(cheap.offers.map((o) => o.platform).sort()).toEqual(["ishopping", "mega"]);
  });
});

describe("PTA separation with the rule matcher", () => {
  it("never loses or duplicates an offer", () => {
    const input = iphone17();
    const groups = groupListingsByProduct(input);
    expect(groups.flatMap((g) => g.offers.map((o) => o._id)).sort()).toEqual(input.map((o) => o._id).sort());
  });
});
