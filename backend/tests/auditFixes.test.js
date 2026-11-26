// The fixes of the search and grouping audit of 26 Nov 2026 (D:\FYP PROJECT\audit\AUDIT-REPORT-2026-11-26-search.md, A-02 to A-06).
import { describe, it, expect } from "vitest";

import { separateByCondition, titleCondition, groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { namesSearch } from "../src/services/searchRanking.service.js";
import { attributeConflict } from "../src/services/similarity.service.js";
import { sanitizePrices, isPlaceholderPrice } from "../src/services/priceSanity.service.js";
import { analyzePricePlausibility } from "../src/services/pricePlausibility.service.js";
import { headlineOffers } from "../src/services/offerFreshness.service.js";
import { searchWordPattern } from "../src/services/searchMatching.service.js";
import { detectCategory } from "../src/scrapers/productCategory.js";

describe("A-02: a used unit the title names goes apart from the new ones", () => {
  it("reads the condition sellers write in the title", () => {
    expect(titleCondition("Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New")).toBe("used");
    expect(titleCondition("iPhone 15 Pro Max Used")).toBe("used");
    expect(titleCondition("Galaxy S24 Open Box")).toBe("open_box");
    expect(titleCondition("iPhone 14 Refurbished")).toBe("refurbished");
    expect(titleCondition("Apple iPad 11-Inch Silver (Brand New, Non Acticve, Sealed)")).toBeNull();
    expect(titleCondition("Samsung Galaxy S25 Ultra 12GB 512GB")).toBeNull();
  });

  it("takes AlfaMall's like-new S25 Ultras out of the new phone's group, though their condition field says new", () => {
    const o = (id, title, price) => ({ _id: id, platform: id.startsWith("a") ? "alfamall" : "priceoye", title, price, condition: "new", productCategory: "smartphone" });
    const offers = [
      o("a1", "Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New", 322000),
      o("a2", "Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New - HUB", 327499),
      o("p1", "Samsung Galaxy S25 Ultra 12GB – 512GB", 354999),
      o("p2", "Samsung Galaxy S25 Ultra 12GB 512GB", 389999),
      o("p3", "Samsung Galaxy S25 Ultra PTA Approved 12GB-512GB", 359999),
    ];
    const group = { productName: offers[0].title, rawGroupKey: offers[0].title, normalizedGroupKey: "x", storage: 512, offers, offerCount: 5, lowestPrice: 322000, highestPrice: 389999 };
    const out = separateByCondition([group]);
    expect(out).toHaveLength(2);
    expect(out[0].offers.map((x) => x._id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(out[0].productName).not.toMatch(/like a new/i);
    expect(out[1].offers.map((x) => x._id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("A-03: 'Pro 2nd gen' is the Pro 2", () => {
  const veto = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });
  it("keeps the AirPods Pro 2nd gen apart from the Pro 3, and joins the spellings of one generation", () => {
    expect(veto("Apple Airpods Pro 2nd gen Brand New 1Year Official Warranty", "Apple Airpods Pro 3 Brand New 1Year Official Warranty")).toBe(true);
    expect(veto("Apple Airpods Pro 2nd Generation White", "Apple AirPods Pro 2")).toBe(false);
    expect(veto("Apple iPad 10th Gen 64GB", "Apple iPad 10 64GB")).toBe(false);
  });
  it("leaves a processor's generation alone", () => {
    expect(veto("HP Victus 15 Laptop 13th Gen Core i5", "HP Victus 15 Laptop 13th Gen Core i5 16GB")).toBe(false);
  });
});

describe("A-04: a seller's placeholder price is not a price", () => {
  it("is not stored, is a suspect price, and is never a headline price", () => {
    expect(isPlaceholderPrice(99_999_999)).toBe(true);
    expect(isPlaceholderPrice(2_500_000)).toBe(false);
    expect(sanitizePrices({ price: 99_999_999 }).ok).toBe(false);
    expect(sanitizePrices({ price: 2_500_000 }).ok).toBe(true);
    const placeholder = { _id: "x", price: 99_999_999 };
    expect(analyzePricePlausibility(placeholder, [placeholder]).status).toBe("suspect_high");
    const offers = [{ _id: "a", price: 137999, inStock: true }, { _id: "b", price: 148500, inStock: true }, { _id: "c", price: 99_999_999, inStock: true }];
    expect(headlineOffers(offers).map((o) => o._id)).toEqual(["a", "b"]);
  });
});

describe("A-05: 'mi' finds Xiaomi", () => {
  it("matches 'Mi' and 'Xiaomi', as whole words", () => {
    const finds = (title) => new RegExp(searchWordPattern("mi"), "i").test(title);
    expect(finds("Xiaomi Smart Band 9 Pro")).toBe(true);
    expect(finds("Xiaomi Mi Smart Band 9 Active")).toBe(true);
    expect(finds("Samsung Galaxy A17 Midnight")).toBe(false);
  });
});

describe("A-06: a case is an accessory, the case a device comes in is not", () => {
  it.each([
    ["AirPods 4 Spigen Case", "accessory"],
    ["WIWU Mecha Airpods Pro 3 Case", "accessory"],
    ["Samsung Galaxy S25 Ultra Silicone Case - Black", "accessory"],
    ["Apple AirPods 4 With Wireless Charging Case", "headphones"],
    ["Apple AirPods Pro 2 with MagSafe Charging Case", "headphones"],
    ["Apple Watch Series 10 46mm Aluminum Case", "smartwatch"],
    ["Apple Watch Series 11 46mm Aliminium Case", "smartwatch"],
    ["Apple Watch Ultra 2 49MM Black Titanium Case", "smartwatch"],
    ["WiWU Airbuds Pro 2", "headphones"],
  ])("%s is %s", (title, category) => {
    expect(detectCategory(title).category).toBe(category);
  });
});

describe("one product page and card, and other models after the one searched for (2026-11-26)", () => {
  it("a bare model name at one store joins the one named version others sell (Airbud 550 / 550 Slide)", () => {
    const e = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "headphones", inStock: true });
    const groups = groupListingsByProduct([
      e("p", "priceoye", "Audionic Airbud 550", 3895),
      e("a", "audionic", "Airbud 550 Slide Earbuds", 3999),
      e("i", "ishopping", "Audionic Airbud 550 Slide Earbuds", 3999),
      e("d", "digimall", "Audionic Airbud 550 Slide Earbuds", 4299),
      e("s", "shophive", "Airbud 550 Slide Earbuds", 4499),
    ], { matchStrategy: mlMatchStrategy });
    const holding = (id) => groups.find((g) => g.offers.some((o) => o._id === id));
    expect(holding("p")).toBe(holding("i"));
  });

  it("but not when the bare name is sold at several stores, nor at prices more than 10% apart", () => {
    // (whether the plain and ANC AirPods 4 join is the matcher's, audit A-11: the pass changes nothing here)
    const e = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "headphones", inStock: true });
    const parts = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy }).map((g) => g.offers.map((o) => o._id).sort().join("+")).sort();
    const without = (listings) => {
      process.env.SHOPSAVVY_NO_BARE_NAME = "1";
      try { return parts(listings); } finally { delete process.env.SHOPSAVVY_NO_BARE_NAME; }
    };
    const severalStores = [
      e("p1", "priceoye", "Huawei Watch Fit 4", 33000), e("p2", "mega", "Huawei Watch Fit 4", 33500),
      e("a1", "ishopping", "Huawei Watch Fit 4 Pro", 34000), e("a2", "digimall", "Huawei Watch Fit 4 Pro", 34500),
    ];
    expect(parts(severalStores)).toEqual(without(severalStores));
    const priced = [
      e("p", "priceoye", "Audionic Airbud 550", 2999),
      e("a", "audionic", "Airbud 550 Slide Earbuds", 3999), e("i", "ishopping", "Audionic Airbud 550 Slide Earbuds", 3999),
    ];
    expect(parts(priced)).toEqual(without(priced));
  });

  it("tells the model searched for from other models of its line", () => {
    const g = (name) => ({ rawGroupKey: name, productName: name, offers: [{ title: name }] });
    expect(namesSearch(g("HUAWEI Watch GT 5 Pro 46mm"), "gt 5")).toBe(true);
    expect(namesSearch(g("Huawei Watch GT5 46mm"), "huawei gt 5")).toBe(true);
    expect(namesSearch(g("Huawei Watch GT 6 46mm"), "huawei gt 5")).toBe(false);
    expect(namesSearch(g("HUAWEI Watch GT 2 Pro 5 ATM"), "gt 5")).toBe(false);
    expect(namesSearch(g("Anything"), "")).toBe(true);
  });
});
