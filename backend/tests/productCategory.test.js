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
// 2026-11-07, from searching: Infinix phones were "other", Xiaomi rice cookers were phones.
describe("detectCategory: phone lines without a phone word, and cookers", () => {
  it.each([
    ["Infinix Hot 50 Pro", "smartphone"],
    ["Infinix Note Edge 8/256 | PTA Approved", "smartphone"],
    ["Tecno Spark 40 Pro 8GB 256GB", "smartphone"],
    ["Honor X8d", "smartphone"],
    ["Samsung S23 Ultra 12GB RAM", "smartphone"], // no "Galaxy" in the title
    ["Samsung S26 Ultra 12/256 | PTA Approved | On Easy Monthly Installments", "smartphone"],
    ["Samsung 24 Inch S24C310 FHD IPS Monitor", "monitor"], // Samsung's monitor codes start S24, S27: no phone
    ["Infinix InBook Air XL442 Core i3 8GB 256GB SSD", "laptop"],
    ["Xiaomi Multifunctional Rice Cooker 4L", "appliance"],
    ["Anex Digital Electric Pressure Cooker AG-2188", "appliance"],
  ])("%s -> %s", (title, expected) => {
    expect(detectCategory(title).category).toBe(expected);
  });

  it("does not make phones of the same brands' other products, or of a replacement battery", () => {
    for (const title of ["Itel IBS-51 Bluetooth Speaker", "Itel 7 Liters AirFryer IAF-003", "TECNOGAS COOKING RANGE PTV762XS", "Infinix XS01 Pocket Beat Wireless Bluetooth Speaker", "New Ghosia Collection Infinix Note 12 Battery (BL-44FX)"]) {
      expect(detectCategory(title).category, title).not.toBe("smartphone");
    }
  });
});

// 2026-11-07: an air mouse "for Android and Smart TV" (PKR 1,499) was the lowest price of a search for TVs.
describe("detectCategory: products made for a TV", () => {
  it.each([
    "Speedx Air Mouse MX3 for Android and Smart TV",
    "M.Mart Air Mouse For Smart TV - Black (C120)",
    "MX3 Smart TV Voice Air Mouse 2.4G Wireless Keyboard with Mouse Function for",
    "Kisonli LED-805 Wireless Speaker With High Quality Sound Soundbar for TV, Sound",
  ])("%s -> accessory", (title) => {
    expect(detectCategory(title).category).toBe("accessory");
  });

  it.each([
    "itel TV Plus Mini Soundbar (ITL-SB310)",
    "LG S75TR 5.1.1 channel 600W TV Soundbar with Dolby Atmos",
    "F&D T200X Wireless TV Speaker (Black)",
    "Amazon Fire TV Stick 4K Max",
    "Dany AX-100 Amaze 4GB 32GB Android TV Box",
    "Logitech K400 Plus Wireless Touch TV Keyboard",
    "Nintendo Switch HDMI Tv Dock Set With Charger",
  ])("keeps %s (it plugs into a TV) out of TVs", (title) => {
    expect(detectCategory(title).category).not.toBe("tv");
  });

  it("files a Xiaomi TV box neither as a TV nor as a phone (\"xiaomi\" is a phone word)", () => {
    for (const title of ["Xiaomi TV Box S (3rd Gen)", "Xiaomi TV Stick 4K (2nd Gen)", "Xiaomi Mi Box S 4K Ultra HD Streaming Media Player Android TV Box"]) {
      expect(["tv", "smartphone"]).not.toContain(detectCategory(title).category);
    }
    expect(detectCategory("Xiaomi Redmi Note 14 Pro 8GB 256GB").category).toBe("smartphone");
  });

  it("leaves TVs sold \"only for Karachi\" (76 of them) as TVs", () => {
    expect(detectCategory("SAMSUNG 55\" Crystal UHD U8000F 4K Smart TV-FOR KARACHI ONLY").category).toBe("tv");
    expect(detectCategory("TCL 85\" QD-Mini LED TV (C6K) Only for Karachi").category).toBe("tv");
    expect(detectCategory("Samsung 43 Inch Full Hd Display UA43T5300AUSMZ Led Tv perfect for bedrooms and living rooms").category).toBe("tv");
  });
});

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

// 2026-11-08: the price drops' "Smartphones" showed Redmi Buds, a Xiaomi outdoor camera and an air purifier. A phone maker's bare
// name tied with the product's own word, and the phone list came first. Live titles.
describe("detectCategory: a phone maker's other products, and phones that only name their line", () => {
  it.each([
    ["Redmi Buds 8 Lite", "headphones"],
    ["Xiaomi Redmi Buds 6 Pro", "headphones"], // two brand names are still one brand
    ["XIAOMI SOLAR OUTDOOR CAMERA BW400 PRO", "camera"],
    ["Xiaomi Smart Air Purifier 4 Lite", "appliance"],
    ["Infinix Smart Air Purifier", "appliance"],
    ["Xiaomi Redmi Watch 5", "smartwatch"],
    ["Huawei Band 10", "smartwatch"],
    ["Xiaomi 45W Nano Turbo Charging Power Adapter (2-Port)", "accessory"],
    ["Xiaomi Redmi Pad 2 8/256", "tablet"],
    // still phones
    ["Xiaomi 15T Pro 12GB 512GB", "smartphone"],
    ["Redmi Note 15 Pro 256GB", "smartphone"],
    ["Vivo V70 RAM 12GB ROM 256 GB Camera 50mp Battery 6500 Mah One year Brand Warranty", "smartphone"], // its cameras, not a camera
    ["Vivo V60 12/256 | PTA Approved | On Easy Monthly Installments | Fast Delivery | Electronix Hub", "smartphone"], // the seller, not a hub
    ["Samsung A17 8GB 256GB At 0% Markup On Upto 6 Months Installments", "smartphone"],
    ["Infinix Smart 20 128GB 4GB RAM Shadow Black", "smartphone"],
    ["Nothing Phone 3a Lite 5G | 8/256 GB | Urban Hub", "smartphone"],
    // and the rest stay where they were
    ["UGreen 60568 USB C HUB 3 IN 1", "accessory"],
    ["Haier AC 2 ton Floor Standing With Air Purifier T3 PLUS Inverter HPU-24HJ", "air_conditioner"],
  ])("%s -> %s", (title, expected) => {
    expect(detectCategory(title).category).toBe(expected);
  });
});

describe("things made for a device are not the device (2026-11-09, one AlfaMall seller's accessories)", () => {
  it.each([
    ["Muzamil Store Multi-Angle Smartphone Car Mount", "accessory"],
    ["Muzamil Store Two-in-one Car Rear Seat Mobile Phone Holder (K336)", "accessory"],
    ["Muzamil Store Universal Car Back Seat Tablet Holder - Black", "accessory"],
    ["Zhiyun Smooth 5 Smartphone Gimbal", "accessory"],
    ["Muzamil Store On-Camera Microphone Recording Mic for Phone Smartphone", "!camera"],
    ["Rode VideoMic NTG On-Camera Shotgun Microphone", "!camera"],
    ["Muzamil Store 3V Lithium Button Cell Battery For Camera (CR2025) - Pack Of 5", "!camera"],
    ["Muzamil Store 3V Cell lithium Battery For Watches (CR2032) - Pack Of 5", "!smartwatch"],
    ["Muzamil Store Resistance Exercise Bands Sets - 5Pcs", "!smartwatch"],
    ["Muzamil Store Chest Expander Silicone Bands 5 Tubes", "!smartwatch"],
    ["Muzamil Store Adjustable Basket Rack For Fridge", "!refrigerator"],
    ["Muzamil Store 8.5 inch Gracile Font LCD Tablet Drawing", "!tablet"],
    // and the devices stay devices
    ["UGREEN 15728 1080p USB Web Camera with Microphone Plug and Play Webcam (NEW)", "camera"],
    ["Westpoint Revolve WP-5010 Smart Watch 1.43 Inch AMOLED Display, Bluetooth 5.3 & IP67 Water Resistance", "smartwatch"],
    ["Haier HRF-368 Refrigerator", "refrigerator"],
    ["Samsung Galaxy A17 6GB RAM 128GB Storage PTA Approved", "smartphone"],
  ])("%s -> %s", (title, expected) => {
    const { category } = detectCategory(title);
    if (expected.startsWith("!")) expect(category).not.toBe(expected.slice(1));
    else expect(category).toBe(expected);
  });
});

describe("only phones in the phones (2026-11-10: the phones' brand filter listed Audionic, Dell, HP, Ronin and Zero)", () => {
  it.each([
    // a maker's other products, filed as phones on its name alone
    ["Xiaomi Smart Kettle 2 Pro-White", "!smartphone"],
    ["Xiaomi Smart Projector L1 Pro", "!smartphone"],
    ["Xiaomi Robot Vacuum X20 Pro", "appliance"],
    ["Xiaomi Compact Hair Dryer H101", "!smartphone"],
    ["Xiaomi 20W Power Strip", "!smartphone"],
    ["Xiaomi 120W HyperCharge Combo (Type-A)", "!smartphone"],
    ["Xiaomi 16-in-1 Ratchet Screwdriver", "!smartphone"],
    ["Xiaomi 65 inch Q LED A Pro 2026", "!smartphone"],
    ["Xiaomi Oscillation Electric Toothbrush", "!smartphone"],
    ["Huawei 24-Port Gigabit L2 Managed Switch (S220S-24T4JX)", "!smartphone"],
    // a phone word, but not a phone
    ["Audionic Milan Mobile Speaker", "!smartphone"],
    ["Dell Precision 15 5520 Mobile Workstation - 7th Gen Core i7 7820HQ Processor 16-GB 512-GB SSD", "laptop"],
    ["HP Laser MFP 135w Printer 4ZB83A Mobile Printing (Official Warranty)", "printer"],
    ["Ronin R-909 Type C To IPhone", "!smartphone"],
    ["Ronin OTG iPhone Connector Black (R-3000)", "!smartphone"],
    ["ZERO PIXEL SILVER WATCH", "smartwatch"],
    ["Huawei GT6 Pro 46mm Titanium", "smartwatch"],
    ["Samsung Galaxy Active 2 Aluminum (44mm)", "smartwatch"],
    ["Oppo Enco Air", "headphones"],
    ["Oppo Pad 3", "tablet"],
    ["Huawei MediaPad T3 10", "tablet"],
    ["WiWU Wi-P052 Galaxy Series 10000mah 35W Fast Charging Power Bank", "accessory"],
    // and the phones stay phones, also those named by the maker and a model alone
    ["Infinix Hot 70 | Official Pta Approved | With Free XP05 Powerbank | At 0% Markup", "smartphone"],
    ["Xiaomi 15T Pro", "smartphone"],
    ["Xiaomi Mi Note 10 Lite", "smartphone"],
    ["Xiaomi Black Shark 4 Pro", "smartphone"],
    ["Xiaomi Pocophone F2 Pro", "smartphone"],
    ["Xiaomi Redmi Go", "smartphone"],
    ["Vivo Y05", "smartphone"],
    ["Vivo - V80 Lite 5G RAM", "smartphone"],
    ["Vivo iQOO Neo", "smartphone"],
    ["Oppo A6-S Pro - 8GB RAM", "smartphone"],
    ["Huawei P40 Pro", "smartphone"],
    ["Huawei Enjoy Max", "smartphone"],
    ["Huawei Ascend Mate 7", "smartphone"],
    ["Nokia 3210", "smartphone"],
    ["OnePlus Clover", "smartphone"],
    ["Nothing Phone 3A", "smartphone"],
    ["Apple iPhone 16 Pro Max PTA Approved 1TB White Titanium", "smartphone"],
    ["Samsung Galaxy S20 FE Fan Edition", "smartphone"],
  ])("%s -> %s", (title, expected) => {
    const { category } = detectCategory(title);
    if (expected.startsWith("!")) expect(category).not.toBe(expected.slice(1));
    else expect(category).toBe(expected);
  });
});

describe("the cheap ends of phones, laptops and tablets hold devices (audit finding 7, 2026-11-12)", () => {
  it.each([
    ["The One Device: The Secret History of the iPhone Book", "!smartphone"],
    ["Shop Zone IPhone Cigarette Lighter Refillable Gas", "!smartphone"],
    ["Planet X iPhone Walkie Talkie (SS-9022)", "!smartphone"],
    ["YOUKSH iPhone 18 Pro Privacy Glass", "!smartphone"],
    ["Samsung Galaxy SmartTag 2", "!smartphone"],
    ["Boya Lightning to 3.5mm Headphone Jack Audio Adapter (IPHONE TO 3.5MM)", "accessory"],
    ["226-2181 LEARN TO WRITE 4 IN 1 NOTEBOOK", "!laptop"],
    ["OZUKO LAPTOP BACK PACK 18 INCH 8925M", "!laptop"],
    ["Super Asia ASPIRE AC Inverter Fan", "!laptop"],
    ["Amaze A535 Aluminum Alloy Foldable Laptop & Tablet Riser", "!tablet"],
    ["ESR Apple iPad 9th Gen 2021 Ascend Hard Shell Case – Clear", "accessory"],
    ["Apple Magic Keyboard iPad Pro 13\" (MWR53)", "accessory"],
    ["KK2711-1 MUSICAL HELLO KITTY IPAD A.I", "!tablet"],
    // and the devices stay devices
    ["APPLE IPHONE 17 PRO MAX (Free Original Apple USB-C 20W Power Adapter)", "smartphone"],
    ["Acer Aspire 7 Core i5 16GB 512GB", "laptop"],
    ["Redmi Pad 2 Wifi 8GB 256GB ( With Free cover)", "tablet"],
    ["Samsung Galaxy Tab S10 Ultra (X920) Wifi With Keyboard", "tablet"],
    ["Xiaomi Pad 8 With Keyboard", "tablet"],
  ])("%s -> %s", (title, expected) => {
    const { category } = detectCategory(title);
    if (expected.startsWith("!")) expect(category).not.toBe(expected.slice(1));
    else expect(category).toBe(expected);
  });
});

describe("the last accessories at the cheap end (2026-11-12)", () => {
  it.each([
    ["MyEshop IPhone 11 Pro Max Battery", "!smartphone"],
    ["Apple iPhone USB-C 20W Power Adapter - Installments (Pak Mobiles)", "!smartphone"],
    ["IPAD 11 Pro 2024 With Pen Slot Back Cover - Black (Pak Mobiles)", "!tablet"],
    ["UGREEN 90915 USB C Fast Charging Smart Stylus Pen for Apple iPad (White, NEW)", "!tablet"],
    ["Samsung Galaxy Tab S9 Ultra/Tab S9+/Tab S9 S Pen Beige", "!tablet"],
    ["XP-Pen Deco Fun S 6.3″ X 4″ Graphic Tablet Classic Black", "!tablet"],
    // devices
    ["APPLE IPHONE 17 PRO MAX (Free Original Apple USB-C 20W Power Adapter)", "smartphone"],
    ["Samsung Galaxy S25 FE 8GB RAM 256GB Storage | 50MP Triple Camera | 4900 mAh Battery", "smartphone"],
    ["Samsung Galaxy Tab S9 FE With S Pen 8GB 256GB", "tablet"],
    ["Lenovo Tab M8", "tablet"],
  ])("%s -> %s", (title, expected) => {
    const { category } = detectCategory(title);
    if (expected.startsWith("!")) expect(category).not.toBe(expected.slice(1));
    else expect(category).toBe(expected);
  });
});

describe("a store's test listing is no product (2026-11-12)", () => {
  it("'Testing COD - Dawlance - Smart LED TV ...' is other; a real 'Test' word later in a title is not affected", () => {
    expect(detectCategory("Testing COD - Dawlance - Smart LED TV Canvas Series 55 Inch - G3A - 55G3A").category).toBe("other");
    expect(detectCategory("Samsung 55 Inch Crystal UHD 4K Smart TV (Tested Picture Quality)").category).toBe("tv");
  });
});
