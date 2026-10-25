// Formal Vitest version of the 17 hand-labeled cases in test-categories.js
// (kept as-is at the repo root as a standalone diagnostic script -- same
// data, real assertions instead of console.log.
import { describe, it, expect } from "vitest";
import { detectCategory } from "../src/scrapers/productCategory.js";

// expected starting with "!" means "must NOT classify as this category"
// (used for accessory-exclusion cases), matching the original script.
const CASES = [
  ["HP Victus 15-FA2787NR Core i7-13620H Gaming Laptop", "laptop"],
  ["Dell Vostro 15 3530 Laptop Core i7-1355U (8GB, 512GB SSD)", "laptop"],
  ["Lenovo IdeaPad Slim 3 15.6 inch Core i5 512GB SSD", "laptop"],
  ["MacBook Air M3 13 inch 256GB SSD 8GB RAM", "laptop"],
  ["ASUS VivoBook 15 X1504 Core i3 8GB RAM 512GB SSD", "laptop"],
  ["Lexar DDR5 8GB 5600Mhz Ram For Laptop", "!laptop"],
  ["Transcend JetRam 16GB 4800MHz DDR5 Laptop Ram", "!laptop"],
  ["Dell Latitude E6440 Laptop Battery", "!laptop"],
  ["Swissewin Laptop Backpack", "!laptop"],
  ["Targus Geo 15.6 Mojave Laptop Backpack", "!laptop"],
  ["Awei X30 Desktop Folding Laptops & Tablets Holder", "!laptop"],
  ["Apple iPhone 15 128GB PTA Approved", "smartphone"],
  ["Apple iPhone 15 Silicone Case", "!smartphone"],
  ["Samsung 55 Inch QLED Smart TV", "tv"],
  ["Apple MacBook Air M3 13 inch 256GB", "laptop"],
  ["Apple 96W USB-C Power Adapter for MacBook Pro", "!laptop"],
  ["Anker 65W Wall Charger for MacBook Air", "!laptop"],
];

describe("detectCategory (17 hand-labeled classification cases)", () => {
  it.each(CASES)("%s -> %s", (title, expected) => {
    const { category } = detectCategory(title);
    const negate = expected.startsWith("!");
    const target = negate ? expected.slice(1) : expected;

    if (negate) {
      expect(category).not.toBe(target);
    } else {
      expect(category).toBe(target);
    }
  });
});

// "... for iPhone 17 Pro", "... for iPad Pro": made for the device, never the device (2026-10-26). A PKR 8,990 UNIQ bundle was
// shown as the lowest price of the iPhone 17 Pro, and 56 iPad keyboards and folios were filed as tablets. Live titles.
describe("detectCategory: products made for a phone or tablet", () => {
  it.each([
    ["UNIQ 3 in 1 ClearVue 360 Essential Bundle Pack for iPhone 17 Pro – Clear", "accessory"],
    ["Torras Ostand Q3 VegSkin for iPhone 17 Pro Max", "accessory"], // names no accessory word: the fallback
    ["Choetech B662 5000mAh Magnetic Wireless Powerbank For iPhone", "accessory"],
    ["Umc Communication Back Transparent protector For Samsung A52", "accessory"],
    ["Apple Magic Keyboard for iPad Pro 11-inch M4 US English Black MWR23", "accessory"],
    ["Smart Folio for iPad Pro 13-inch (M4)", "accessory"], // the fallback, for a tablet
    ["Targus Triad for Samsung Galaxy Tab 3 10.1\" (Black)", "accessory"],
  ])("%s -> %s", (title, expected) => {
    expect(detectCategory(title).category).toBe(expected);
  });

  it("keeps the kind of product a title names", () => {
    expect(detectCategory("Sennheiser MM 50 IP Headset for iPhone (White)").category).toBe("headphones");
    expect(detectCategory("Sennheiser HD 218i Headset for iPhone/iPod/iPad").category).toBe("headphones");
  });

  it("leaves the phones and tablets themselves alone", () => {
    expect(detectCategory("Apple iPhone 17 Pro 256GB PTA Approved").category).toBe("smartphone");
    expect(detectCategory("Samsung Galaxy S25 Ultra 12GB 256GB").category).toBe("smartphone");
    expect(detectCategory("Apple iPad Pro 11-inch M4 256GB Wi-Fi").category).toBe("tablet");
    expect(detectCategory("Samsung Galaxy Tab S10 FE 8GB 128GB").category).toBe("tablet");
  });

  it("leaves an unknown title unknown", () => {
    expect(detectCategory("Gift voucher PKR 5000").category).toBe("other");
  });
});
