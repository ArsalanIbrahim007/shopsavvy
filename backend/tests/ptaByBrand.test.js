import { describe, it, expect } from "vitest";

import { groupListingsByProduct, NON_PTA_RISK_BRANDS } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";

// Only imported makers' phones are sold here both PTA-approved and not; every other maker's are approved unless a store says
// otherwise (2026-11-18). Offers whose title and page say nothing.
let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `6a00000000000000000b${String(++n).padStart(4, "0")}`, platform, title, normalizedTitle: title.toLowerCase(), price,
  productCategory: "smartphone", inStock: true, condition: "new", lastScrapedAt: new Date(), ptaStatus: "unknown", ...over,
});
const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const offersOf = (groups) => groups.flatMap((g) => g.offers);

describe("PTA by maker", () => {
  it("takes an unstated Infinix as approved, says it is by its maker, and does not call it 'not stated'", () => {
    const offers = offersOf(group([
      listing("priceoye", "Infinix Note 60 Pro 8GB 256GB PTA Approved", 118999),
      listing("techroid", "Infinix Note 60 Pro 5G 8GB – 256GB", 118799),
    ]));
    const techroid = offers.find((o) => o.platform === "techroid");
    expect(techroid).toMatchObject({ ptaStatus: "pta_approved", ptaSource: "brand" });
    expect(techroid.ptaAssessment).toBeUndefined();
  });

  it("still calls an unstated Samsung 'not stated' beside approved ones", () => {
    const offers = offersOf(group([
      listing("mega", "Samsung Galaxy A17 6GB 128GB PTA Approved", 68999),
      listing("eezepc", "Samsung Galaxy A17 6GB – 128GB", 68490),
    ]));
    expect(offers.find((o) => o.platform === "eezepc")).toMatchObject({ ptaAssessment: "not_stated", ptaStatus: "unknown" });
  });

  it("never overrides what a title or page says", () => {
    const offers = offersOf(group([listing("mega", "Infinix Hot 60 Pro 8GB 128GB NON PTA", 50000), listing("x", "Infinix Hot 60 Pro 8GB 128GB", 51000, { ptaStatus: "non_pta", ptaSource: "product_page" })]));
    expect(offers.every((o) => o.ptaSource !== "brand")).toBe(true);
  });

  it("applies only to phones and tablets, and names the import makers", () => {
    const [tv] = offersOf(group([listing("x", "Infinix 43 Inch Smart TV", 50000, { productCategory: "tv" })]));
    expect(tv.ptaSource).toBeUndefined();
    for (const brand of ["apple", "samsung", "google", "oneplus"]) expect(NON_PTA_RISK_BRANDS.has(brand)).toBe(true);
    expect(NON_PTA_RISK_BRANDS.has("infinix")).toBe(false);
  });
});
