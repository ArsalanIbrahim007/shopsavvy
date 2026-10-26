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

// Parts and add-ons that name a laptop (2026-10-26): a PKR 990 "Dell Latitude ... Battery Connection Cable" was the "dell
// latitude" search's lowest price, and 86 of 1,092 "laptops" cost under PKR 15,000. Live titles.
describe("detectCategory: laptop parts and add-ons", () => {
  it.each([
    ["Dell Latitude DJ1J0 For Battery Connection Cable", "accessory"],
    ["Dell Latitude 33YDH Battery Cable for Wired Laptop", "accessory"],
    ["Samsung AA-PB9NS6B New Laptop 6 Cell Battery", "accessory"],
    ["Replacement Battery for Dell Latitude E6400 E6410 E6500 E6510 Precision M2400 M4400 M4500 M6400 Laptop", "accessory"],
    ["Dell Latitude NF2MW 52Wh 4-Cell New Original Battery", "other"], // out of laptops; names no laptop word for the fallback
    ["G-Mart Ultra Clear Laptop Matte Skin Protector", "accessory"], // names no accessory word: the laptop fallback
    ["Muzamil Store Premium Privacy Screen Protector For 13.3 Inch MacBook Air", "accessory"],
    ["Easy Shop Foldable Wooden Laptop Table Black", "accessory"],
    ["Boya Conference Mic for Windows Laptop - Black (BY-MC2)", "accessory"],
    ["Best Laptops Under 1 Lakh in Pakistan 2026: Students, Freelancers & Office Use", "accessory"],
    ["UGREEN USB C to DisplayPort 1.4 Cable 2m, 8K@60Hz 4K@240Hz Thunderbolt 4/3 to DisplayPort Cord USB C for MacBook Pro, iPad Pro", "accessory"],
    ["ASUS TUF Gaming H1 Gen II Wired Headset, 40mm Petrol Speakers, 7.1 Virtual Surround Sound, TeamSpeak Certified Microphone, 297g Lightweight Design", "headphones"],
  ])("%s -> %s", (title, expected) => {
    expect(detectCategory(title).category).toBe(expected);
  });

  it("keeps Asus's PC parts, sold under its laptop names (TUF Gaming, ROG), out of laptops", () => {
    expect(detectCategory("Asus TUF Gaming X670E Plus Wifi Motherboard").category).not.toBe("laptop");
    expect(detectCategory("Asus TUF Gaming LC III 360 ARGB LCD All In One Liquid CPU Cooler").category).not.toBe("laptop");
    expect(detectCategory("Asus TUF Gaming 120 ARGB Fan Single Pack").category).not.toBe("laptop");
  });

  // 31 TUF/ROG listings were filed as laptops on those names alone (found 2026-10-26).
  it.each([
    ["Asus ROG Phone 5 Ultimate", "smartphone"],
    ["Asus TUF Gaming H3 Gaming Headset", "headphones"],
    ["Asus TUF Gaming H1 Wireless Headphone (Black)", "headphones"],
    ["Asus TUF Gaming Series 5 VG27AQ5A 27\" 2K QHD Monitor", "monitor"],
    ["Asus ROG Herculx Graphics Card Holder", "accessory"],
  ])("files Asus's other TUF/ROG products where they belong: %s -> %s", (title, expected) => {
    expect(detectCategory(title).category).toBe(expected);
  });

  it.each([
    "Asus TUF Gaming Radeon RX9060 XT 16GB GDDR6 OC Edition",
    "Asus ROG Strix GeForce RTX 5070Ti 16GB GDDR7 OC Edition Graphic Card",
    "Asus ROG SL 400 Destrier Ergo Gaming Chair",
    "Asus X901 ROG Strix Scope II 96 Wireless",
    "ASUS ROG Strix Helios Computer Casing",
    "Asus ESD S1C ROG Strix Arion SSD Enclosure",
    "Asus Rog RG-07 Performance Thermal Paste Kit",
    "Asus ROG NVLinK Bridge with Aura Sync RGB",
  ])("keeps %s out of laptops", (title) => {
    expect(detectCategory(title).category).not.toBe("laptop");
  });

  it("reads \"rog\" as a word, not inside Frog, Program or Neutrogena", () => {
    expect(detectCategory("MXG PGC-01 Frog Mechanism Premium PVC Gaming Chair").category).not.toBe("laptop");
    expect(detectCategory("Dawlance DDW-1350S 5 Program Dish Washer 13 Place Capacity Silver").category).not.toBe("laptop");
    expect(detectCategory("NEUTROGENA CLEAR AND DEFEND RAPID GEL 15 ML").category).not.toBe("laptop");
    expect(detectCategory("ASUS ROG Strix G16 G615LM Core Ultra 7 255HX 16GB 512GB SSD").category).toBe("laptop");
  });

  it("leaves laptops themselves alone, including cheap ones whose titles praise the battery", () => {
    expect(detectCategory("Acer C740 4gb / 16gb - Chromebook Laptop - With Play Store - Long Battery Life").category).toBe("laptop");
    expect(detectCategory("Dell Latitude 14 5490 - Kaby Lake - 7th Gen Core i5 7300U 8-GB 256-GB SSD").category).toBe("laptop");
    expect(detectCategory("Asus TUF Gaming A15 FA506NCR Ryzen 7 7435HS 16GB 512GB RTX 3050").category).toBe("laptop");
    expect(detectCategory("Lenovo IdeaPad Flex 5 15.6 Inches Core i7 (16GB RAM - 512GB SSD)").category).toBe("laptop");
  });
});
