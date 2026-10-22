// The wrong merges found by the B9 grouping evaluation (src/ml/GROUPING_EVALUATION.md), each turned into a rule and a test. Titles are
// the live ones from the labelled sample (ids in brackets), so a test failing here means one of those mistakes is back.
import { describe, it, expect } from "vitest";

import { attributeConflict, numberSlots, lineWords } from "../src/services/similarity.service.js";
import { extractCondition } from "../src/services/productAttributes.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { extractPtaStatus } from "../src/services/productAttributes.service.js";

const conflict = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });

describe("a number after the same word must agree", () => {
  it("separates models whose number differs after the same word", () => {
    expect(conflict("Max 585 Ultra 3 Seven + One Smart Watch", "Max 580 Ultra 3 Seven + One Smart Watch")).toBe(true); // m079
    expect(conflict("Max 585 Ultra 3 Seven + One Smart Watch", "Max 576 Ultra 3 Seven + One Smart Watch")).toBe(true); // m080
    expect(conflict("Gus-03 Ultra 3 7+1 Smart Watch", "Gus-01 Ultra 3 7+1 Smart Watch")).toBe(true); // m087
    expect(conflict( // m053: both say "Ultra 7", which used to hide the 14 / 16
      "Lenovo ThinkBook 14 G8 IAL Core Ultra 7 255H (16GB Ram - 512GB SSD)",
      "Lenovo ThinkBook 16 G8 Arrow Lake 16\" Intel Core Ultra 7 255H 16GB RAM 512GB SSD Laptop 1 Year Warranty",
    )).toBe(true);
  });

  it("does not separate titles that agree, or where only one names the slot", () => {
    expect(conflict("Max 585 Ultra 3 Smart Watch", "Max 585 Ultra 3 Seven + One Smart Watch Black")).toBe(false);
    expect(conflict("Samsung Galaxy Z Fold 7 12GB RAM 256GB Storage", "Samsung Galaxy Z Fold 7 Dual Sim")).toBe(false);
    expect(conflict("Honor 400 Lite 8GB 256GB", "Honor 400 Lite")).toBe(false);
    expect(conflict("Lenovo ThinkBook 14 G8 Core Ultra 7", "Lenovo ThinkBook 14 G8 Core Ultra 7 255H Laptop")).toBe(false);
  });

  it("ignores numbers after words that name an operating system or CPU family", () => {
    expect(numberSlots("Dell Laptop Windows 11 Ryzen 5").size).toBe(0);
  });

  it("ignores numbers that count something sold with the product", () => {
    expect(conflict("Lenovo IdeaPad Slim 3 Laptop 1 Year Warranty", "Lenovo IdeaPad Slim 3 Laptop 2 Years Warranty")).toBe(false);
    expect(numberSlots("i40 Ultra2 Suit 7 Sets Straps Smart Watch").size).toBe(0);
  });

  it("compares both halves of a decimal: a 2.0 and a 2.1 channel soundbar differ", () => {
    expect(conflict("Xiaomi Soundbar Pro 2.0 ch", "Xiaomi Soundbar Pro 2.1 ch")).toBe(true);
    expect(conflict("Xiaomi Soundbar Pro 2.0 ch", "Xiaomi Soundbar Pro 2.0 ch 42W Black")).toBe(false);
  });
});

describe("a generation number only one title states", () => {
  it("separates a first-generation product from a numbered one (m097)", () => {
    expect(conflict("Samsung Galaxy Buds Pro", "Samsung Galaxy Buds 2 Pro")).toBe(true);
    expect(conflict("Samsung Galaxy Buds 2 Pro Graphite", "Samsung Galaxy Buds Pro")).toBe(true);
    expect(conflict("Samsung Galaxy Buds Live Pro", "Samsung Galaxy Buds 2 Pro")).toBe(true);
  });

  it("leaves Apple's unnumbered iPhone Air alone: stores sell it as 'iPhone 17 Air'", () => {
    expect(conflict("Apple iPhone Air 256GB", "Apple iPhone 17 Air PTA Approved 256GB")).toBe(false);
  });

  it("reads 'iPhone 17 Air' as the iPhone Air, so the trained matcher puts them together", () => {
    const g = group([
      listing("mega", "Apple iPhone Air 512GB Storage PTA Approved", 504999),
      listing("eezepc", "Apple iPhone Air 512GB", 562990),
      listing("shophive", "Apple iPhone 17 Air 512GB PTA Approved", 508499),
      listing("xcessorieshub", "Apple iPhone 17 Air PTA Approved 512GB", 549999),
    ]);
    expect(g).toHaveLength(1);
  });

  it("leaves a number added at the end alone (specClassification.test.js: Watch Ultra / Watch Ultra 2)", () => {
    expect(conflict("Samsung Galaxy Watch Ultra 47mm", "Samsung Galaxy Watch Ultra 2 47mm")).toBe(false);
    expect(conflict("Samsung Galaxy Buds Pro", "Samsung Galaxy Buds Pro Wireless")).toBe(false);
  });

  it("does not fire when both titles carry other numbers, as laptop titles do", () => {
    expect(conflict("HP 15 Core i5 1334U 8GB 512GB", "HP 15 Core i5 1334U 10 Core 8GB 512GB")).toBe(false);
  });
});

describe("line words", () => {
  it("separates Redmi Note 7 Pro from Redmi 7 Pro and Redmi 9A Sport from Redmi 9A (m009, m045)", () => {
    expect(conflict("Xiaomi Redmi Note 7 Pro", "Xiaomi Redmi 7 Pro")).toBe(true);
    expect(conflict("Xiaomi Redmi 9A Sport", "Xiaomi Redmi 9A")).toBe(true);
    expect(conflict("Samsung Galaxy Watch 8 Classic", "Samsung Galaxy Watch 8 44mm")).toBe(true);
    // Found when the first version of these rules was run over the live catalogue.
    expect(conflict("Samsung Galaxy S7", "Samsung Galaxy S7 edge Dual SIM")).toBe(true);
    expect(conflict("Xiaomi Redmi 10", "Xiaomi Redmi 10 Prime")).toBe(true);
    expect(conflict("Huawei Honor 10", "Huawei Honor 10 GT")).toBe(true);
    expect(conflict("Xiaomi Redmi 9", "Xiaomi Redmi 9 Power")).toBe(true);
    expect(conflict("Samsung Galaxy Z Fold 7 12GB 256GB", "Samsung Galaxy Z Flip 7 12GB 256GB")).toBe(true);
    expect(conflict("Samsung Galaxy Z Flip 7 12GB 256GB", "Samsung Galaxy Z 7 12GB 256GB")).toBe(true);
    expect(conflict("Xiaomi Redmi Note 15 8GB 128GB", "Xiaomi Redmi 15 8GB 128GB")).toBe(true);
  });

  it("reads a letter after the number as part of the model, but not a unit", () => {
    expect(conflict("Xiaomi Redmi Note 11T Pro", "Xiaomi Redmi Note 15 Pro 12GB 512GB")).toBe(true);
    expect(conflict("Xiaomi Redmi 15C", "Xiaomi Redmi 15 8GB 128GB")).toBe(true);
    expect(conflict("Samsung Galaxy A27 5G 8GB 256GB", "Samsung Galaxy A27 5G Dual Sim")).toBe(false);
  });

  it("does not fire when both say it, or on longer words that contain it", () => {
    expect(conflict("Xiaomi Redmi Note 15 8GB 256GB", "Xiaomi Redmi Note 15 Dual Sim")).toBe(false);
    expect(lineWords("HP 250R G9 Notebook PC").size).toBe(0);
    expect(lineWords("Galaxy Watch 8 Classic").has("classic")).toBe(true);
  });
});

describe("Wi-Fi against cellular", () => {
  it("separates a tablet's Wi-Fi and cellular versions when both titles say", () => {
    expect(conflict("Xiaomi Redmi Pad 2 4G", "Xiaomi Redmi Pad 2 8GB 256GB SSD - Wifi")).toBe(true);
    expect(conflict("Apple iPad Air M4 256GB WiFi", "Apple iPad Air M4 256GB Cellular")).toBe(true);
    expect(conflict("Samsung Galaxy Tab S11 Ultra 5G", "Samsung Galaxy Tab S11 Ultra Wi-Fi")).toBe(true);
  });

  it("does not when one title is silent, or a cellular title also lists Wi-Fi", () => {
    expect(conflict("Xiaomi Redmi Pad 2 WiFi", "Xiaomi Redmi Pad 2 Wifi 1 Year Warranty")).toBe(false);
    expect(conflict("Xiaomi Redmi Pad 2 4G", "Xiaomi Redmi Pad 2 8/256 4G")).toBe(false);
    expect(conflict("Apple iPad Air M4 WiFi + Cellular", "Apple iPad Air M4 Cellular")).toBe(false);
    expect(conflict("Samsung Galaxy A27 5G 8GB 256GB", "Samsung Galaxy A27 5G Dual Sim")).toBe(false);
  });
});

describe("condition: a unit sold with cosmetic marks is not a new one", () => {
  it("reads Paklap's 'Brand New, Light Cosmetic Marks' as open box (m054, m058)", () => {
    expect(extractCondition("HP 250R G9 Notebook PC (Black, Brand New, Light Cosmetic Marks)")).toBe("open_box");
    expect(extractCondition("Dell Laptop - Minor Cosmetic Marks")).toBe("open_box");
    // AlfaMall sellers' used laptops (2026-10-22)
    expect(extractCondition("Dell Latitude 5440 Core i5 8GB RAM 128GB Storage Like New")).toBe("used");
    expect(extractCondition("HP EliteBook 840 G5 (Like-New)")).toBe("used");
    expect(extractCondition("Samsung Galaxy A17 Brand New")).toBe("new");
    expect(extractCondition("HP 250R G9 Notebook PC (Black, NEW)")).toBe("new");
    expect(conflict(
      "HP 250R G9 Notebook PC - 13th Gen Core i5 1334U 8-GB 512-GB SSD (Black, Brand New, Light Cosmetic Marks)",
      "HP 250R G9 Notebook PC - 13th Gen Core i5 1334U 8-GB 512-GB SSD (Black, NEW)",
    )).toBe(true);
  });
});

let n = 0;
const listing = (platform, title, price, over = {}) => ({
  _id: `id${++n}`, platform, title, normalizedTitle: title.toLowerCase(), price, productCategory: "smartphone",
  ptaStatus: extractPtaStatus(title), inStock: true, lastScrapedAt: new Date().toISOString(), priceHistory: [], ...over,
});
const group = (listings) => groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy });
const together = (groups, a, b) => groups.some((g) => g.offers.some((o) => o.title === a) && g.offers.some((o) => o.title === b));

describe("one store's two pages of a model, one stating the capacity and one not", () => {
  it("are different variants when the store prices them apart (m003, m019, m017)", () => {
    const g = group([
      listing("mega", "Apple iPhone 16 Pro Max 512GB Dual Sim NON PTA", 344999),
      listing("mega", "Apple iPhone 16 Pro Max", 319999),
    ]);
    expect(together(g, "Apple iPhone 16 Pro Max 512GB Dual Sim NON PTA", "Apple iPhone 16 Pro Max")).toBe(false);
  });

  it("are one product when the store prices them alike, and another store's bare title still joins", () => {
    const g = group([
      listing("mega", "Apple iPhone 17 256GB Storage NON PTA", 289999),
      listing("mega", "Apple iPhone 17", 284999),
      listing("shophive", "Apple iPhone 16 Pro Max 512GB", 340000),
      listing("ishopping", "Apple iPhone 16 Pro Max", 335000),
    ]);
    expect(together(g, "Apple iPhone 17 256GB Storage NON PTA", "Apple iPhone 17")).toBe(true);
    expect(together(g, "Apple iPhone 16 Pro Max 512GB", "Apple iPhone 16 Pro Max")).toBe(true);
  });
});

describe("a title without a capacity joins the variant priced nearest it", () => {
  // The live case: bare "Redmi Note 15 Pro" offers at PKR 92,000 sat in the 12GB/512GB group (PKR 113,000), not the 8GB/256GB one
  // (PKR 93,000), because that group happened to come first.
  const variants = () => [
    listing("shophive", "Xiaomi Redmi Note 15 Pro 12GB 512GB", 112999),
    listing("mega", "Xiaomi Redmi Note 15 Pro 12GB RAM 512GB Storage PTA APPROVED", 115999),
    listing("priceoye", "Xiaomi Redmi Note 15 Pro", 91999),
    listing("shophive", "Xiaomi Redmi Note 15 Pro 8GB 256GB", 93999),
    listing("mega", "Xiaomi Redmi Note 15 Pro 8GB RAM 256GB Storage PTA APPROVED", 96999),
  ];

  it("whichever order the listings arrive in", () => {
    const base = variants();
    for (const order of [base, [...base].reverse(), [base[2], base[0], base[1], base[3], base[4]]]) {
      const g = group(order);
      expect(together(g, "Xiaomi Redmi Note 15 Pro", "Xiaomi Redmi Note 15 Pro 8GB 256GB")).toBe(true);
      expect(together(g, "Xiaomi Redmi Note 15 Pro", "Xiaomi Redmi Note 15 Pro 12GB 512GB")).toBe(false);
    }
  });

  it("prefers a capacity variant it matches to a group of other bare titles priced apart from it", () => {
    const g = group([
      listing("shophive", "Xiaomi Redmi Note 15 Pro 8GB 256GB", 93999),
      listing("priceoye", "Xiaomi Redmi Note 15 Pro", 140000), // too dear for that variant: starts a group of its own
      listing("telemart", "Xiaomi Redmi Note 15 Pro Dual Sim With Official Warranty", 94999),
    ]);
    expect(together(g, "Xiaomi Redmi Note 15 Pro Dual Sim With Official Warranty", "Xiaomi Redmi Note 15 Pro 8GB 256GB")).toBe(true);
    expect(together(g, "Xiaomi Redmi Note 15 Pro Dual Sim With Official Warranty", "Xiaomi Redmi Note 15 Pro")).toBe(false);
  });

  it("so one store's bare page does not keep its own stated pages out of their group (iShopping, Galaxy A07)", () => {
    const g = group([
      listing("ishopping", "Samsung Galaxy A07", 37295),
      listing("shophive", "Samsung Galaxy A07 4GB 128GB", 43499),
      listing("ishopping", "Samsung Galaxy A07 128GB 4GB RAM Black", 44880),
      listing("mega", "Samsung Galaxy A07 4GB RAM 128GB Storage", 45999),
    ]);
    expect(together(g, "Samsung Galaxy A07 128GB 4GB RAM Black", "Samsung Galaxy A07 4GB 128GB")).toBe(true);
    expect(together(g, "Samsung Galaxy A07 128GB 4GB RAM Black", "Samsung Galaxy A07")).toBe(false);
  });
});

describe("a capacity stated on one side only needs the price to agree (the trained matcher)", () => {
  it("keeps a bare title out of a stated variant priced far from it (m008)", () => {
    const g = group([
      listing("mega", "Samsung Galaxy S26 Ultra 12GB RAM 256GB Storage", 269999),
      listing("ishopping", "Samsung Galaxy S26 Ultra", 388999),
    ]);
    expect(g).toHaveLength(2);
  });

  it("still lets a dearer PTA-approved bare title join, so the cheap stated one is moved out and labelled 'likely non-PTA'", () => {
    const g = group([
      listing("mega", "Apple iPhone 17 256GB", 284999),
      listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999),
      listing("telemart", "Apple iPhone 17 PTA Approved Physical Sim", 397999),
    ]);
    expect(together(g, "Apple iPhone 17 PTA Approved Physical Sim", "Apple iPhone 17 256GB PTA Approved")).toBe(true);
    expect(g.find((x) => x.offers.some((o) => o.title === "Apple iPhone 17 256GB")).ptaStatus).toBe("likely_non_pta");
  });

  it("keeps a far cheaper bare title out when no offer says PTA approved (m005)", () => {
    const g = group([
      listing("eezepc", "Apple iPhone 17 512GB", 482490),
      listing("mega", "Apple iPhone 17", 279999),
    ]);
    expect(g).toHaveLength(2);
  });

  it("keeps a far dearer bare title out of a PTA-approved group: only cheaper ones are left to the PTA separation", () => {
    const g = group([
      listing("shophive", "Apple iPhone 17 256GB PTA Approved", 389999),
      listing("telemart", "Apple iPhone 17 PTA Approved", 489999),
    ]);
    expect(g).toHaveLength(2);
  });

  it("lets it join when the price is close", () => {
    const g = group([
      listing("shophive", "Samsung Galaxy A27 5G 8GB 256GB", 117999),
      listing("telemart", "Samsung Galaxy A27 5G Dual Sim with Official Warranty", 113499),
    ]);
    expect(g).toHaveLength(1);
  });
});

describe("an offer of unstated PTA status priced far above a non-PTA one", () => {
  it("is not grouped with it (m016: 40% dearer is the PTA unit), whichever arrives first", () => {
    const nonPta = listing("mega", "Samsung Galaxy S26 Ultra 12GB RAM 512GB Storage NON PTA", 318999);
    const unstated = listing("shophive", "Samsung Galaxy S26 Ultra 12GB 512GB", 446999);
    for (const order of [[nonPta, unstated], [unstated, nonPta]]) {
      expect(together(group(order), nonPta.title, unstated.title)).toBe(false);
    }
  });

  it("is grouped with it when priced alike, and the rule leaves other categories alone", () => {
    const close = group([
      listing("mega", "Samsung Galaxy S26 Ultra 12GB RAM 512GB Storage NON PTA", 318999),
      listing("shophive", "Samsung Galaxy S26 Ultra 12GB 512GB", 330000),
    ]);
    expect(close).toHaveLength(1);
    const laptops = group([
      listing("mega", "Dell Inspiron 15 Core i5 16GB 512GB NON PTA", 100000, { productCategory: "laptop" }),
      listing("priceoye", "Dell Inspiron 15 Core i5 16GB 512GB", 140000, { productCategory: "laptop" }),
    ]);
    expect(laptops).toHaveLength(1);
  });
});
