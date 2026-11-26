// Phones grouped by their identity (2026-11-27): the Galaxy A17 5G 8GB 256GB was four products, Vivo Y500 products mixed 8/128 with
// 8/256, an Oppo A6C product held A6Ks. Audit: src/scripts/ml/22-audit-phones.js.
import { describe, it, expect } from "vitest";

import { phoneKey, phoneNetwork } from "../src/services/phoneIdentity.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";

const phone = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "smartphone", inStock: true, condition: "new" });
const holding = (groups, id) => groups.find((g) => g.offers.some((o) => o._id === id));

describe("a phone's identity, however a store words it", () => {
  it.each([
    ["Samsung A17 5G 8GB 256GB At 0% Markup On Upto 6 Months Installments with 1 Year Warranty & PTA Approved By AllTech", "samsung|a17|8|256|"],
    ["Samsung Galaxy A17 5G | (8GB RAM 256GB) | PTA Approved | Official Warranty With Free SURPRISE GIFT |", "samsung|a17|8|256|"],
    ["Samsung Galaxy A17 8GB 256GB 5G Samsung Official Store", "samsung|a17|8|256|"],
    ["Vivo Y05e 4/64 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", "vivo|y05e|4|64|"],
    ["Vivo Y05 E 4 GB Ram 64 GB Storage", "vivo|y05e|4|64|"],
    ["Infinix hot 50 Saga Green 8GB 128GB", "infinix|hot50|8|128|"],
    ["Infinix Hot 50 Pro 8GB 128GB", "infinix|hot50pro|8|128|"],
    ["Tecno Spark 40 Pro+ 8/256", "tecno|spark40proplus|8|256|"],
    ["Samsung Galaxy Fold 5 12GB 512GB", "samsung|zfold5|12|512|"],
    ["Apple iPhone 17 Air 256GB", "apple|iphoneair||256|"],
    ["Apple iPhone Air Sky Blue 256GB", "apple|iphoneair||256|"],
    ["Apple iPhone 13 (Sierra Blue) PRO 128 GB Factory Unlocked PTA Approved(FREE CHARGER AND COVER)", "apple|iphone13pro||128|"],
    ["Apple iPhone 16 Pro Max 256GB Non PTA", "apple|iphone16promax||256|nonpta"],
  ])("%s", (title, key) => {
    expect(phoneKey(title)).toBe(key);
  });

  it("says nothing when the title names no single phone", () => {
    expect(phoneKey("vivo Y500 - 8GB RAM - 128/256GB ROM")).toBeNull(); // two storages
    expect(phoneKey("VIVO Y500 8GB RAM PTA APROVED")).toBeNull(); // no storage
    expect(phoneKey("Haier 1/2 Ton")).toBeNull();
  });

  it("reads 5G apart from the key", () => {
    expect(phoneNetwork("Samsung Galaxy A17 5G 8GB 256GB")).toBe("5g");
    expect(phoneNetwork("Samsung Galaxy A17 8GB 256GB")).toBe("");
  });
});

describe("grouping phones by identity", () => {
  it("joins one phone's sellers' copies, and keeps the A17 4G and 5G apart (priced apart)", () => {
    const groups = groupListingsByProduct([
      phone("a", "mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", 96999),
      phone("b", "alfamall", "Samsung A17 5G 8GB 256GB At 0% Markup On Upto 6 Months Installments with 1 Year Warranty & PTA Approved By AllTech", 96299),
      phone("c", "alfamall", "Samsung A17 5G 8GB RAM 256GB ROM | PTA Approved | One Year Brand Warranty | Authentico.pk", 96799),
      phone("d", "alfamall", "Samsung Galaxy A17 8GB 256GB 5G Samsung Official Store", 100299),
      phone("e", "techroid", "Samsung Galaxy A17 8GB – 256GB", 79999),
      phone("f", "eezepc", "Samsung Galaxy A17 8GB – 256GB", 77490),
    ], { matchStrategy: mlMatchStrategy });
    for (const id of ["b", "c", "d"]) expect(holding(groups, id)).toBe(holding(groups, "a"));
    expect(holding(groups, "e")).toBe(holding(groups, "f"));
    expect(holding(groups, "e")).not.toBe(holding(groups, "a"));
  });

  it("joins one phone that some stores call 5G and others do not, when priced alike", () => {
    const groups = groupListingsByProduct([
      phone("a", "priceoye", "Vivo V70 FE 12GB 256GB", 139999),
      phone("b", "mega", "Vivo V70 FE 5G 12GB 256GB Pta Approved With Official Warranty At 0% Markup On Upto 6 Months", 141000),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "a")).toBe(holding(groups, "b"));
  });

  it("takes another phone out of a product: another storage, another model", () => {
    const groups = groupListingsByProduct([
      phone("a", "alfamall", "Vivo Y500 8/128 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 99719),
      phone("b", "alfamall", "Vivo Y500 8/256 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 99879),
      phone("c", "techroid", "Vivo Y500 8GB – 128GB", 94999),
      phone("d", "alfamall", "Oppo A6C 4/128 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 54449),
      phone("e", "alfamall", "Oppo A6K 4/128 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 54500),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "a")).toBe(holding(groups, "c"));
    expect(holding(groups, "b")).not.toBe(holding(groups, "a"));
    expect(holding(groups, "d")).not.toBe(holding(groups, "e"));
  });
});
