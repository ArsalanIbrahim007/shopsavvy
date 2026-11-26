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
    ["Samsung Galaxy S26+ 12GB 256GB", "samsung|s26plus|12|256|"],
    ["Apple Iphone 17 Pro Max 256 | PTA Approved | With Official Warranty", "apple|iphone17promax||256|"],
    ["VIVO Y500 (8GB | 256) On Easy Monthly Instalments by ALI's Mobile", "vivo|y500|8|256|"],
    ["OnePlus 13 - 12GB RAM 256GB", "oneplus|13|12|256|"],
    ["Realme Note 60x 64GB 8GB (3+5GB External RAM) - ISPK-0514", "realme|note60x|3|64|"],
    ["Realme Note 60x 3+5=8GB 64GB Dual - PTA Approved", "realme|note60x|3|64|"],
    ["Tecno Spark 40 8+256GB", "tecno|spark40|8|256|"],
    ["Samsung Galaxy S26 Plus 12GB+ 256GB", "samsung|s26plus|12|256|"],
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

  it("joins one phone's cheap stores and instalment sellers, judged by their nearest prices, and says which phone it is", () => {
    const groups = groupListingsByProduct([
      phone("t", "techroid", "Redmi 14C (6GB – 128GB)", 29999),
      phone("m", "mistore", "Redmi 14C (6GB -128GB)", 32499),
      phone("x", "xcessorieshub", "Redmi 14C (6GB -128GB) Midnight Black", 27799),
      phone("a1", "alfamall", "Xiaomi Redmi 14C 6/128 | PTA Approved | On Easy Monthly Installments | Electronix Hub", 35999),
      phone("a2", "alfamall", "Xiaomi Redmi 14C 6/128 | PTA Approved | With Official Warranty", 51509),
      phone("a3", "alfamall", "Xiaomi Redmi 14C 6/128 | PTA Approved | On Easy Monthly Installments | Other Seller", 51499),
      phone("f", "techroid", "Redmi 14C 4GB – 128GB", 25999),
    ], { matchStrategy: mlMatchStrategy });
    for (const id of ["m", "x", "a1"]) expect(holding(groups, id)).toBe(holding(groups, "t"));
    expect(holding(groups, "a2").phone).toEqual({ model: "xiaomi|redmi14c", ram: 6, storage: 128 });
    expect(holding(groups, "t").phone).toEqual({ model: "xiaomi|redmi14c", ram: 6, storage: 128 });
    expect(holding(groups, "f").phone).toEqual({ model: "xiaomi|redmi14c", ram: 4, storage: 128 });
  });

  it("joins a phone sold in one version whose dearer sellers say 5G, and one whose instalment sellers ask a third more", () => {
    const groups = groupListingsByProduct([
      phone("a", "techroid", "Samsung Galaxy A57 12GB 256GB", 164000),
      phone("b", "eezepc", "Samsung Galaxy A57 12GB 256GB", 168000),
      phone("c", "alfamall", "Samsung Galaxy A57 5G 12GB 256GB PTA Approved | 0% Markup up to 6 Months | Seller One", 185000),
      phone("d", "alfamall", "Samsung Galaxy A57 5G 12GB 256GB PTA Approved | 0% Markup up to 6 Months | Seller Two", 189000),
      phone("r1", "alfamall", "Realme Note 60x 3GB 64GB 0% Markup On Upto 6 Months Installments with 1 Year Warranty", 30899),
      phone("r2", "alfamall", "Realme Note 60x 3GB 64GB 0% Markup On Upto 6 Months Installments By Other Seller", 31499),
      phone("r3", "techroid", "Realme Note 60X 3GB 64GB", 23999),
    ], { matchStrategy: mlMatchStrategy });
    for (const id of ["b", "c", "d"]) expect(holding(groups, id)).toBe(holding(groups, "a"));
    expect(holding(groups, "r3")).toBe(holding(groups, "r1"));
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

describe("a listing that states no storage (DigiMall's way, 2026-11-27)", () => {
  it("goes to its phone when one storage of that model and RAM is sold, the 5G one when it says 5G", () => {
    const groups = groupListingsByProduct([
      phone("4a", "techroid", "Samsung Galaxy A17 8GB – 256GB", 79999),
      phone("4b", "eezepc", "Samsung Galaxy A17 8GB – 256GB", 77490),
      phone("5a", "mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", 96999),
      phone("5b", "alfamall", "Samsung A17 5G 8GB RAM 256GB ROM | PTA Approved | One Year Brand Warranty | Authentico.pk", 96799),
      phone("d5", "digimall", "Samsung A17 5G 8GB RAM", 96799),
      phone("d4", "digimall", "Samsung Galaxy A17 8GB RAM", 80412),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "d5")).toBe(holding(groups, "5a"));
    expect(holding(groups, "d4")).toBe(holding(groups, "4a"));
    expect(holding(groups, "4a")).not.toBe(holding(groups, "5a"));
  });

  it("keeps the 4G and 5G apart when their price ranges overlap", () => {
    const groups = groupListingsByProduct([
      phone("4a", "techroid", "Samsung Galaxy A17 8GB – 256GB", 79999),
      phone("4b", "eezepc", "Samsung Galaxy A17 8GB – 256GB", 80490),
      phone("4c", "alfamall", "Samsung Galaxy A17 8GB 256GB | PTA Approved | By Some Seller", 86999),
      phone("5a", "mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", 96999),
      phone("5b", "alfamall", "Samsung A17 5G 8GB RAM 256GB ROM | PTA Approved | One Year Brand Warranty | Authentico.pk", 96799),
      phone("5c", "alfamall", "Samsung A17 5G 8GB 256GB | PTA Approved | Cheap Seller", 82999),
      phone("d", "digimall", "Samsung Galaxy A17 8GB RAM", 84900),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "d")).toBe(holding(groups, "4a"));
  });

  it("stays where it is when several storages are sold", () => {
    const groups = groupListingsByProduct([
      phone("a", "techroid", "Samsung Galaxy A17 8GB – 256GB", 79999),
      phone("b", "techroid", "Samsung Galaxy A17 8GB – 128GB", 74999),
      phone("c", "digimall", "Samsung Galaxy A17 8GB RAM", 77000),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "c")).not.toBe(holding(groups, "a"));
  });
});

describe("a listing that names the model only (AlfaMall's sellers, 2026-11-27)", () => {
  const a17 = () => [
    phone("6a", "techroid", "Samsung Galaxy A17 6GB – 128GB", 71999),
    phone("6b", "eezepc", "Samsung Galaxy A17 6GB – 128GB", 72499),
    phone("4a", "techroid", "Samsung Galaxy A17 8GB – 256GB", 81999),
    phone("4b", "eezepc", "Samsung Galaxy A17 8GB – 256GB", 81899),
    phone("5a", "mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", 96999),
    phone("5b", "alfamall", "Samsung A17 5G 8GB RAM 256GB ROM | PTA Approved | One Year Brand Warranty | Authentico.pk", 97299),
    phone("5c", "shophive", "Samsung Galaxy A17 5G 8GB 256GB", 97499), // a third store: the A17 5G is another phone than the 4G
  ];

  it("joins the version its price clearly points to", () => {
    const groups = groupListingsByProduct([
      ...a17(),
      phone("one", "alfamall", "Samsung Galaxy A17 6.7 Inches Display On Installment By OneStop Naya Nazimabad", 78499),
      phone("easy", "alfamall", "Samsung A17 by EasyPay", 100000),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "one")).toBe(holding(groups, "4a"));
    expect(holding(groups, "easy")).toBe(holding(groups, "5a"));
  });

  it("joins the variant its store's page sells it as, while the price is still that variant's", () => {
    const variant = { ramGb: 6, storageGb: 128, label: "128GB - 6GB RAM", price: 65999 };
    const groups = groupListingsByProduct([
      ...a17(),
      { ...phone("ish", "ishopping", "Samsung Galaxy A17", 65999), pageVariant: variant },
      { ...phone("old", "ishopping", "Samsung Galaxy A17", 64299), pageVariant: { ...variant, price: 61000 } },
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "ish")).toBe(holding(groups, "6a"));
    expect(holding(groups, "old")).not.toBe(holding(groups, "6a")); // price changed since the page was read
  });

  it("joins the one version a model is sold in when priced within its range", () => {
    const groups = groupListingsByProduct([
      phone("a", "techroid", "Vivo X300 Pro 16GB 512GB", 349999),
      phone("b", "eezepc", "Vivo X300 Pro 16GB 512GB", 367499),
      phone("m", "alfamall", "Vivo X300 Pro | PTA Approved | By Some Store", 316999),
    ], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "m")).toBe(holding(groups, "a"));
  });

  it("stays apart when its price sits between two versions, or far from all", () => {
    const groups = groupListingsByProduct([
      ...a17(),
      phone("mid", "alfamall", "Samsung Galaxy A17 By Some Store", 76900),
      phone("low", "alfamall", "Samsung Galaxy A17", 64299),
    ], { matchStrategy: mlMatchStrategy });
    for (const id of ["6a", "4a", "5a"]) {
      expect(holding(groups, "mid")).not.toBe(holding(groups, id));
      expect(holding(groups, "low")).not.toBe(holding(groups, id));
    }
  });
});

describe("a MacBook is one product whatever its colour (2026-11-27)", () => {
  it("reads line, size, chip, RAM and storage however a store writes them", async () => {
    const { macbookKey } = await import("../src/services/phoneIdentity.service.js");
    for (const t of ["Apple MacBook Air 13 MDHH4 M5 Chip 16GB RAM 512GB SSD SkyBlue", "Apple MacBook Air 13.6 inches M5 Chip (16GB-512GB SSD)", "Apple MacBook Air M5 13″ 16GB – 512GB", "Apple Macbook Air 13\" M5 Chip 16GB 512GB SSD Midnight (MDVH4)"]) {
      expect(macbookKey(t)).toBe("apple|macbook air|13|m5|16|512");
    }
    expect(macbookKey("Apple | MacBook Air 15inch | MDVQ4 | M5 Chip | 10Core CPU | 10Core GPU | 16GB RAM | 512GB Storage")).toBe("apple|macbook air|15|m5|16|512");
    expect(macbookKey("Apple Macbook AIR 15 INCH M5 CHIP-16/1TB With Official Warranty")).toBe("apple|macbook air|15|m5|16|1024");
    expect(macbookKey("Apple MacBook Air 13 MDHH4 - Apple M5 Chip 10-Core CPU 8-Core GPU 16-GB RAM 512-GB SSD")).toBe("apple|macbook air|13|m5|16|512");
    expect(macbookKey("Apple MacBook Air 13 M5 Chip")).toBeNull(); // no memory stated
  });

  it("joins the colours of the 13\" M5 16GB 512GB, keeps the 15\" apart, and takes a 15\" out of a 13\" product", () => {
    const mac = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "laptop", inStock: true, condition: "new" });
    const groups = groupListingsByProduct([
      mac("sky", "mega", "Apple MacBook Air 13 MDHH4 M5 Chip 16GB RAM 512GB SSD SkyBlue", 409999),
      mac("star", "mega", "Apple MacBook Air 13 MDHA4 M5 Chip 16GB RAM 512GB SSD Starlight", 409999),
      mac("mid", "ishopping", "Apple Macbook Air 13\" M5 Chip 16GB 512GB SSD Midnight (MDVH4)", 404999),
      mac("gen", "techroid", "Apple MacBook Air M5 13″ 16GB – 512GB", 385000),
      mac("f1", "mega", "Apple MacBook Air 15 M5 Chip MDVH4 10C CPU 10C GPU 16GB RAM 512GB SSD Midnight", 451999),
      mac("f2", "alfamall", "Apple Macbook Air M5 Chip MDVH4 16GB - 512GB SSD With Official Warranty 15 Inch", 469999),
    ], { matchStrategy: mlMatchStrategy });
    for (const id of ["star", "mid", "gen"]) expect(holding(groups, id)).toBe(holding(groups, "sky"));
    expect(holding(groups, "f1")).toBe(holding(groups, "f2"));
    expect(holding(groups, "f1")).not.toBe(holding(groups, "sky"));
  });
});
