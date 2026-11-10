// Brands read from titles (productAttributes extractBrand) and the catalog's brand filter (catalogFeed brandOfGroup), 2026-11-10: only
// two stores state a brand, so the phones' brand filter listed "SAMSUNG 14, Samsung 10, Apple 2".
import { describe, it, expect } from "vitest";

import { extractBrand } from "../src/services/productAttributes.service.js";
import { brandOfGroup } from "../src/services/catalogFeed.service.js";

describe("extractBrand", () => {
  it.each([
    ["Apple iPhone 17 256GB", null, "apple"],
    ["iPhone 16 Pro Max 256GB", null, "apple"],
    ["SAMSUNG Galaxy A17", "SAMSUNG", "samsung"],
    ["Galaxy S26 Ultra 12GB", null, "samsung"],
    ["Redmi Note 15 Pro 8GB", null, "xiaomi"],
    ["Xiaomi Poco C85", null, "xiaomi"],
    ["Nothing CMF Phone 2 Pro", null, "nothing"],
    ["Bloody MR710 RGB", null, "a4tech"],
    ["Dell Latitude 5420", null, "dell"],
    ["Muzamil Store Universal Car Holder", null, null],
    ["QPhone X1", "Qmobile", "qmobile"], // a brand we do not list is kept, in lower case
  ])("%s (stated %s) is %s", (title, stated, brand) => {
    expect(extractBrand(title, stated)).toBe(brand);
  });
});

describe("brandOfGroup", () => {
  it("is the brand most offers name, whatever case the stores write it in", () => {
    const offers = [{ title: "SAMSUNG Galaxy A17", brand: "SAMSUNG" }, { title: "Samsung Galaxy A17 8GB" }, { title: "Galaxy A17 PTA" }];
    expect(brandOfGroup({ offers })).toBe("samsung");
    expect(brandOfGroup({ offers: [{ title: "Muzamil Store Car Holder" }] })).toBeNull();
  });
});
