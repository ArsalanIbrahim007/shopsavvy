import { describe, it, expect } from "vitest";

import { extractNetworkGeneration, networkFamilyKey, extractColour } from "../src/services/productAttributes.service.js";
import { attributeConflict, isSimilarProduct } from "../src/services/similarity.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";

describe("extractNetworkGeneration", () => {
  it("reads 5G and 4G / LTE as whole words", () => {
    expect(extractNetworkGeneration("Samsung Galaxy A17 5G")).toBe(5);
    expect(extractNetworkGeneration("Samsung Galaxy A17 5 G")).toBe(5);
    expect(extractNetworkGeneration("samsung galaxy a17 5g 256gb")).toBe(5);
    expect(extractNetworkGeneration("Samsung Galaxy A17 4G")).toBe(4);
    expect(extractNetworkGeneration("Xiaomi Redmi Note 14 LTE")).toBe(4);
  });

  it("says nothing when the title says nothing, or names both (store wording, not a difference)", () => {
    expect(extractNetworkGeneration("Samsung Galaxy A17")).toBeNull();
    expect(extractNetworkGeneration("Samsung Galaxy A17 4G/5G")).toBeNull();
    expect(extractNetworkGeneration("Samsung Galaxy A17 4G and 5G")).toBeNull();
    expect(extractNetworkGeneration("")).toBeNull();
    expect(extractNetworkGeneration(undefined)).toBeNull();
  });

  it("does not mistake other things for a network generation", () => {
    expect(extractNetworkGeneration("Lenovo ThinkPad 1135G7 Core i7")).toBeNull(); // CPU model
    expect(extractNetworkGeneration("Samsung 55 Inch 4K Smart TV")).toBeNull(); // resolution
    expect(extractNetworkGeneration("Anker 65W GaN5G Charger")).toBeNull();
    expect(extractNetworkGeneration("Galaxy A17 15G")).toBeNull();
  });
});

describe("networkFamilyKey", () => {
  it("gives a phone and its 4G or 5G version the same key, and different phones different keys", () => {
    const key = networkFamilyKey("Samsung Galaxy A17");
    expect(networkFamilyKey("Samsung Galaxy A17 5G")).toBe(key);
    expect(networkFamilyKey("SAMSUNG Galaxy A17 (4G)")).toBe(key);
    expect(networkFamilyKey("Samsung Galaxy A17 LTE")).toBe(key);
    expect(networkFamilyKey("Samsung Galaxy A57 5G")).not.toBe(key);
    expect(networkFamilyKey("Samsung Galaxy A17 256GB")).not.toBe(key);
  });
});

describe("attributeConflict: network generation", () => {
  it("is a conflict when both titles state a different generation", () => {
    expect(attributeConflict("Xiaomi Redmi Note 14 5G", "Xiaomi Redmi Note 14 4G")).toBe(true);
    expect(attributeConflict("Samsung Galaxy A17 4G 6GB 128GB", "Samsung Galaxy A17 5G 6GB 128GB")).toBe(true);
    expect(isSimilarProduct("Samsung Galaxy A17 5G", "Samsung Galaxy A17 4G", 0.5)).toBe(false);
  });

  it("is not a conflict when the titles agree, or when one (or both) say nothing: stores often omit 5G", () => {
    expect(attributeConflict("Samsung Galaxy A17 5G", "Samsung Galaxy A17 5G")).toBe(false);
    expect(attributeConflict("Samsung Galaxy A17 5G", "Samsung Galaxy A17")).toBe(false);
    expect(attributeConflict("Samsung Galaxy A17", "Samsung Galaxy A17 4G")).toBe(false);
    expect(attributeConflict("Samsung Galaxy A17", "Samsung Galaxy A17")).toBe(false);
    expect(attributeConflict("Samsung Galaxy A17 4G/5G", "Samsung Galaxy A17 5G")).toBe(false);
  });
});

describe("grouping: a store that lists both versions tells us they are different products", () => {
  let n = 0;
  const listing = (platform, title, price) => ({
    _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone",
    inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [],
  });
  const listings = () => [
    listing("priceoye", "Samsung Galaxy A17", 65699),
    listing("ishopping", "Samsung Galaxy A17", 64299),
    listing("priceoye", "Samsung Galaxy A17 5G", 96599),
    listing("ishopping", "Samsung Galaxy A17 5G", 99999),
  ];
  const partition = (groups) => groups.map((g) => g.offers.map((o) => `${o.platform}:${o.title}`).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  const expected = [
    ["ishopping:Samsung Galaxy A17", "priceoye:Samsung Galaxy A17"],
    ["ishopping:Samsung Galaxy A17 5G", "priceoye:Samsung Galaxy A17 5G"],
  ];

  it.each([["the rule matcher", undefined], ["the trained matcher", mlMatchStrategy]])("keeps A17 and A17 5G apart with %s", (_name, strategy) => {
    expect(partition(groupListingsByProduct(listings(), { matchStrategy: strategy }))).toEqual(expected);
  });

  it("gives the same answer whatever order the listings arrive in", () => {
    const base = listings();
    const orders = [base, [...base].reverse(), [base[2], base[0], base[3], base[1]], [base[3], base[2], base[1], base[0]], [base[1], base[3], base[0], base[2]]];
    for (const order of orders) expect(partition(groupListingsByProduct(order))).toEqual(expected);
  });

  it("puts a listing that says nothing about the generation in exactly one of the two groups", () => {
    const all = [...listings(), listing("telemart", "Samsung Galaxy A17 Dual Sim With Official Warranty", 67999)];
    const groups = groupListingsByProduct(all);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((g) => g.offers)).toHaveLength(5);
    const home = groups.find((g) => g.offers.some((o) => o.platform === "telemart"));
    expect(home.offers.some((o) => o.title.includes("5G"))).toBe(false); // the cheaper, plain group comes first
  });

  it("applies what one store showed to every store's titles, including ones with capacities and wording added", () => {
    const groups = groupListingsByProduct([
      listing("priceoye", "Samsung Galaxy A17", 65699),
      listing("priceoye", "Samsung Galaxy A17 5G", 96599),
      listing("mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved", 93999),
      listing("ishopping", "Samsung Galaxy A17 5G", 99999),
      listing("mega", "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", 98999),
    ]);
    const titlesOf = (g) => g.offers.map((o) => `${o.platform}:${o.title}`).sort();
    const fiveG = groups.find((g) => g.offers.some((o) => o.title.endsWith("5G")));
    expect(titlesOf(fiveG)).toEqual(["ishopping:Samsung Galaxy A17 5G", "mega:Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved 5G", "priceoye:Samsung Galaxy A17 5G"]);
    expect(groups.flatMap((g) => g.offers)).toHaveLength(5);
    expect(groups.filter((g) => g !== fiveG).every((g) => g.offers.every((o) => !o.title.endsWith("5G")))).toBe(true);
  });

  it("does not let one store's 'Reno' and 'Reno 5G' split every newer Reno: a longer model name is not store wording", () => {
    const groups = groupListingsByProduct([
      listing("priceoye", "Oppo Reno", 69999),
      listing("priceoye", "Oppo Reno 5G", 89999),
      listing("ishopping", "Oppo Reno 15 5G", 156799),
      listing("priceoye", "Oppo Reno 15", 164999),
    ]);
    const reno15 = groups.find((g) => g.offers.some((o) => o.title.includes("15")));
    expect(reno15.offers).toHaveLength(2); // 15 and 15 5G stay together: no store listed both
    expect(groups).toHaveLength(3);
  });

  it("does not split two stores whose titles differ only in 5G (a store omitting it proves nothing)", () => {
    const groups = groupListingsByProduct([
      listing("ishopping", "Oppo Reno 15 5G", 156799),
      listing("priceoye", "Oppo Reno 15", 164999),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].offers).toHaveLength(2);
  });

  it("does not split one store's ordinary variants, or duplicates that both state 5G", () => {
    const groups = groupListingsByProduct([
      listing("priceoye", "Samsung Galaxy A17 5G", 96599),
      listing("priceoye", "Samsung Galaxy A17 5G", 96999),
      listing("mega", "Samsung Galaxy A17 5G", 98999),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].offers).toHaveLength(3);
  });

  it("does not use a sibling from a different store, nor one that differs in more than the generation", () => {
    const groups = groupListingsByProduct([
      listing("priceoye", "Samsung Galaxy A17 5G 8GB 256GB", 96599),
      listing("priceoye", "Samsung Galaxy A17 8GB 256GB", 93999),
    ]);
    // the same store, titles identical apart from 5G: separate products
    expect(groups).toHaveLength(2);

    const different = groupListingsByProduct([
      listing("priceoye", "Samsung Galaxy A17 5G 8GB 256GB", 96599),
      listing("priceoye", "Samsung Galaxy A17 8GB 128GB", 93999),
    ]);
    expect(different).toHaveLength(2); // split for the storage difference, not the sibling rule
  });
});

describe("extractColour: whole words only", () => {
  it.each([
    ["Xiaomi Redmi Note 14 8GB 256GB", null],
    ["Xiaomi Redmi A5", null],
    ["Blackview BV9300 Pro", null],
    ["Goldmedal Smart Switch", null],
    ["Nubia Red Magic 10 Pro", null],
    ["Green Lion Wall Charger", null],
  ])("finds no colour in %s", (title, expected) => {
    expect(extractColour(title)).toBe(expected);
  });

  it.each([
    ["Xiaomi Redmi Note 14 Black", "Black"],
    ["Samsung Galaxy A17 Red", "Red"],
    ["Samsung Galaxy A17 (Green)", "Green"],
    ["Nubia Red Magic 10 Pro Black", "Black"],
    ["Green Lion Wall Charger White", "White"],
    ["Apple iPhone 17 Space Gray", "Space grey"],
    ["Apple iPhone 17 Pro Natural Titanium", "Natural titanium"],
    ["Samsung Galaxy S25 Silver/Blue", "Silver"],
    ["Apple MacBook Air 13 M5 Skyblue", "Sky blue"],
    ["Apple MacBook Air 13 M5 Sky Blue", "Sky blue"],
    ["Samsung Galaxy S25 Blue", "Blue"],
    ["BLACK Edition Phone", "Black"],
    ["Phone RED", "Red"],
  ])("still finds the colour in %s", (title, expected) => {
    expect(extractColour(title)).toBe(expected);
  });

  it("copes with empty input", () => {
    expect(extractColour("")).toBeNull();
    expect(extractColour(undefined)).toBeNull();
  });
});
