// The grouping mistakes the audit of 2026-11-12 found on the live catalogue, each as it was seen there.
import { describe, it, expect } from "vitest";

import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { extractPtaStatus } from "../src/services/productAttributes.service.js";

let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `a${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone",
  ptaStatus: extractPtaStatus(title), inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [], ...over,
});
const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const withTitle = (groups, re) => groups.find((g) => g.offers.some((o) => re.test(o.title)));

const FUTURE_CELL = "Official Pta Approved 1Year Official Warranty_On Installment By Future Cell At 0% Markup | Upto 6Months";

describe("different makers and models are never one product (audit finding 1)", () => {
  it("an AlfaMall seller's shared wording does not put a Redmi, a Tecno and an Infinix with a Galaxy A17", () => {
    const groups = group([
      listing("alfamall", `Samsung Galaxy A17 6GB 128GB Pta Approved 1Year Official Warranty_On Installment By Future Cell At 0% Markup | Upto 6Months`, 71446),
      listing("alfamall", `Redmi 15C 6GB 128GB ${FUTURE_CELL}`, 36949),
      listing("alfamall", `Tecno Spark 50 6GB 128GB ${FUTURE_CELL}`, 63298),
      listing("alfamall", `Infinix Hot 70 6GB 128GB ${FUTURE_CELL}`, 67248),
    ]);
    const a17 = withTitle(groups, /Galaxy A17/);
    expect(a17.offers).toHaveLength(1);
    expect(a17.lowestPrice).toBe(71446);
    expect(groups).toHaveLength(4);
  });

  it("one maker's different models stay apart: Latitude 7400, 5400 and E5490; Spark Go 3 and Spark 50", () => {
    const laptop = (title, price) => listing("alfamall", title, price, { productCategory: "laptop", ptaStatus: "unknown" });
    const groups = group([
      laptop("DELL Latitude 7400 | Core i5 8th Generation | 8GB Ram | 256GB SSD | 14 Inch | Refurbished Laptop (0% Markup)", 64000),
      laptop("DELL Latitude 5400 (Touchscreen) | Core i5 8th Generation | 8GB Ram | 256GB SSD | 14 Inch | Refurbished Laptop (0% Markup)", 59200),
      laptop("DELL Latitude E5490 | Core i5 8th Generation | 8GB Ram | 256GB SSD | 14 Inch | Refurbished Laptop (0% Markup)", 61000),
    ]);
    expect(groups).toHaveLength(3);
    const phones = group([
      listing("alfamall", "Tecno Spark Go 3 4GB 64GB Official Pta Aproved With Official Warranty At 0% Markup On Upto 6 Months Installments", 37799),
      listing("alfamall", "Tecno Spark 50 4GB 64GB Official Pta Aproved With Official Warranty At 0% Markup On Upto 6 Months Installments", 39999),
    ]);
    expect(phones).toHaveLength(2);
  });

  it("still groups one model written differently: Huawei Honor and Honor, a screen size or 5G in one title only", () => {
    expect(group([listing("priceoye", "Huawei Honor 9X 4GB 128GB", 40000), listing("mega", "Honor 9X 4GB 128GB", 41000)])).toHaveLength(1);
    const laptop = (platform, title, price) => listing(platform, title, price, { productCategory: "laptop", ptaStatus: "unknown" });
    expect(group([
      laptop("paklap", "Apple MacBook Air 13 MDHA4 M5 Chip 16GB RAM 512GB SSD Starlight", 409999),
      laptop("mega", 'Apple MacBook Air 13.6" MDHA4 M5 Chip 16GB RAM 512GB SSD', 412000),
    ])).toHaveLength(1);
    expect(group([listing("priceoye", "Samsung Galaxy A17 5G 8GB 256GB", 80000), listing("mega", "Samsung Galaxy A17 5G 8GB RAM 256GB Storage", 81000)])).toHaveLength(1);
  });
});

describe("a page without a capacity is not a variant's lowest price when it is priced below it (audit finding 2)", () => {
  it("PriceOye's bare Note 60 Pro (95,999) is not the 8GB-256GB's lowest beside PriceOye's own 8GB-256GB page (118,999)", () => {
    const groups = group([
      listing("infinix", "Infinix Note 60 Pro (8GB-256GB)", 116999, { ptaStatus: "pta_approved" }),
      listing("priceoye", "Infinix Note 60 Pro (8GB-256GB)", 118999, { ptaStatus: "pta_approved" }),
      listing("priceoye", "Infinix Note 60 Pro", 95999, { ptaStatus: "pta_approved" }),
    ]);
    const variant = withTitle(groups, /\(8GB-256GB\)/);
    expect(variant.lowestPrice).toBe(116999);
    expect(variant.offers.some((o) => o.price === 95999)).toBe(false);
  });

  it("a bare approved page more than 5% below the cheapest offer stating the variant is its own product; within 5% it joins", () => {
    const groups = group([
      listing("shophive", "Samsung Galaxy A37 5G 8GB RAM 256GB Storage PTA Approved", 133499),
      listing("priceoye", "Samsung Galaxy A37 5G", 122495, { ptaStatus: "pta_approved" }), // 8.2% below
    ]);
    expect(groups).toHaveLength(2);
    const close = group([
      listing("shophive", "Samsung Galaxy S25 12GB 512GB PTA Approved", 274999),
      listing("priceoye", "Samsung Galaxy S25", 265499, { ptaStatus: "pta_approved" }), // 3.5% below
    ]);
    expect(close).toHaveLength(1);
  });
});

describe("a product's own numbers come from offers a shopper could buy (audit finding 11)", () => {
  it("an out-of-stock offer is neither the lowest price nor the best deal while another store has it", () => {
    const [product] = group([
      listing("priceoye", "Samsung Galaxy A17 8GB 256GB PTA Approved", 70000, { inStock: false }),
      listing("mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved", 74000),
    ]);
    expect(product.offers).toHaveLength(2);
    expect(product.lowestPrice).toBe(74000);
    expect(product.bestDeal.platform).toBe("mega");
  });

  it("when nothing is in stock, the out-of-stock prices are still used", () => {
    const [product] = group([listing("priceoye", "Samsung Galaxy A17 8GB 256GB PTA Approved", 70000, { inStock: false })]);
    expect(product.lowestPrice).toBe(70000);
  });
});

describe("a placeholder price is flagged against the same model's other products (audit finding 7)", () => {
  it("a one-store Xiaomi 15T Pro 12/512 at PKR 9,999,999 beside the same phone at about 200,000 is a probable listing error", () => {
    const groups = group([
      listing("alfamall", "Xiaomi 15T Pro 12GB 512GB Official Pta Approved 1Year Official Warranty On Installment By_Microtel", 9999999),
      listing("priceoye", "Xiaomi 15T Pro 12GB 512GB PTA Approved", 199999),
      listing("mega", "Xiaomi 15T Pro 12GB RAM 512GB Storage PTA Approved", 204999),
    ]);
    const placeholder = groups.find((g) => g.offers.some((o) => o.price === 9999999));
    expect(placeholder.offers).toHaveLength(1);
    expect(placeholder.offers[0].priceCheck.status).toBe("suspect_high");
    expect(placeholder.offers[0].priceCheck.reason).toMatch(/same model costs elsewhere/);
    const real = groups.find((g) => g.offers.some((o) => o.price === 199999));
    expect(real.offers.every((o) => o.priceCheck.status !== "suspect_high")).toBe(true);
  });
});

describe("headline offers: in stock before the PTA label (2026-11-12)", () => {
  it("an in-stock offer that does not state PTA is the lowest before an out-of-stock approved one; a likely non-PTA one never is", async () => {
    const { headlineOffers } = await import("../src/services/offerFreshness.service.js");
    const now = Date.now();
    const fresh = new Date(now).toISOString();
    const offers = [
      { price: 123000, inStock: false, lastScrapedAt: fresh },
      { price: 141801, inStock: true, ptaAssessment: "not_stated", lastScrapedAt: fresh },
      { price: 99000, inStock: true, ptaAssessment: "likely_non_pta", lastScrapedAt: fresh },
    ];
    expect(headlineOffers(offers, now).map((o) => o.price)).toEqual([141801]);
    expect(headlineOffers([...offers, { price: 139000, inStock: true, lastScrapedAt: fresh }], now).map((o) => o.price)).toEqual([139000]);
  });
});

// The side effects Fable's review found on the live catalogue (2026-11-12), as regression cases with the real titles and prices.
describe("Fable's review: what the audit fixes broke stays fixed", () => {
  const laptop = (platform, title, price) => listing(platform, title, price, { productCategory: "laptop", ptaStatus: "unknown" });

  it("Paklap's MacBook joins the product its part number names, and is its lowest price", () => {
    const groups = group([
      laptop("paklap", "Apple MacBook Air 13 MDH74 - Apple M5 Chip 10-Core CPU 8-Core GPU 16-GB 512-GB SSD 13.6-Inch Liquid", 399000),
      laptop("xcessorieshub", "Apple MacBook Air 13-inch M5 16GB RAM, 512GB SSD Midnight-MDH74", 424999),
      laptop("alfamall", 'Apple MacBook Air 13.6" M5 16GB 512GB SSD (MDH74)', 435000),
      laptop("digimall", 'Apple MacBook Air 13.6" M5 16GB 512GB SSD (MDH74)', 445000),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lowestPrice).toBe(399000);
  });

  it("AlfaMall's '8/256' offers stay in their product beside AlfaMall's '8GB 256GB' ones", () => {
    // the live product's makeup: stores' plain titles, and AlfaMall sellers writing the capacity three ways
    const groups = group([
      listing("shophive", "Xiaomi Redmi Note 15 8GB 256GB", 75499),
      listing("eezepc", "Xiaomi Redmi Note 15 8GB – 256GB", 75290),
      listing("ishopping", "Xiaomi Redmi Note 15 256GB 8GB RAM Black", 74970),
      listing("alfamall", "Xiaomi Redmi Note 15 256GB - 8GB RAM - PTA Approved - 1 Year Official warranty - (HomeCart)", 76679),
      listing("alfamall", "Xiaomi Redmi Note 15 8/256 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 74739),
      listing("alfamall", "Xiaomi Redmi Note 15 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease", 76759),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("a flagship is not an 'unusual price' against another product that shares only its maker and a digit", () => {
    const groups = group([
      listing("digimall", "Samsung Galaxy Z Fold6 12GB RAM PTA Approved", 526899),
      listing("priceoye", "Samsung Galaxy A06 4GB 64GB PTA Approved", 49999),
      listing("mega", "Samsung Galaxy A06 4GB RAM 64GB Storage PTA Approved", 50999),
    ]);
    const fold = groups.find((g) => g.offers.some((o) => /Fold6/.test(o.title)));
    expect(fold.offers.every((o) => o.priceCheck?.status !== "suspect_high")).toBe(true);
  });

  it("nor a 100-inch TV against an unsized listing of its series that is a smaller size", () => {
    const tv = (platform, title, price) => listing(platform, title, price, { productCategory: "tv", ptaStatus: "unknown" });
    const groups = group([
      tv("shophive", "LG 100 inch QNED AI QNED86 4K Smart TV 2025 (100QNED86A6A)", 1919999),
      tv("mega", "LG QNED86 4K Smart TV 2025", 599999),
      tv("priceoye", "LG QNED86 4K Smart TV 2025 Official Warranty", 609999),
    ]);
    const big = groups.find((g) => g.offers.some((o) => o.price === 1919999));
    expect(big.offers[0].priceCheck?.status).not.toBe("suspect_high");
  });
});
