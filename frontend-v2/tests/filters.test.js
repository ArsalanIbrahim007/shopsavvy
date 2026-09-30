import { describe, it, expect } from "vitest";
import {
  emptyFilters,
  parseFilters,
  filtersToParams,
  isFiltered,
  applyFilters,
  sortOffers,
  filterGroups,
  sortGroups,
  groupKey,
  buildFacets,
  activeCategory,
  categoryCounts,
  platformOptions,
  priceBounds,
  claimedDiscount,
  verifiedDiscount,
  isDiscountDoubtful,
} from "../src/lib/filters.js";

const offer = (id, over = {}) => ({
  _id: id,
  platform: "priceoye",
  price: 100000,
  productCategory: "smartphone",
  ...over,
});

const phones = [
  offer("a", { platform: "priceoye", price: 90000, storageGb: 128, colour: "black", condition: "new", ptaStatus: "pta_approved", dealScore: 80 }),
  offer("b", { platform: "mega", price: 95000, storageGb: 256, colour: "black", condition: "new", ptaStatus: "non_pta", dealScore: 60 }),
  offer("c", { platform: "shophive", price: 70000, storageGb: 256, colour: "blue", condition: "used", ptaStatus: "unknown", dealScore: 90 }),
  offer("d", { platform: "PriceOye", price: 120000, storageGb: 512, colour: "blue", condition: "new", ptaStatus: "pta_approved", dealScore: 40 }),
];

describe("URL round trip", () => {
  it("an empty URL is the default view", () => {
    const filters = parseFilters(new URLSearchParams("q=iphone"));
    expect(filters).toEqual(emptyFilters());
    expect(isFiltered(filters)).toBe(false);
  });

  it("writes only what differs from the default, so URLs stay short", () => {
    expect(filtersToParams(emptyFilters(), "iphone 17").toString()).toBe("q=iphone+17");
  });

  it("round-trips every kind of filter", () => {
    const filters = {
      ...emptyFilters(),
      category: "laptop",
      platforms: ["priceoye", "mega"],
      minPrice: 50000,
      maxPrice: 300000,
      sort: "lowestPrice",
      storage: [256, 512],
      ram: [16],
      screen: [14, 15.6],
      resolution: ["FHD"],
      colour: ["silver"],
      condition: ["new", "refurbished"],
      pta: ["pta_approved"],
    };
    const params = filtersToParams(filters, "laptop");
    expect(parseFilters(new URLSearchParams(params.toString()))).toEqual(filters);
    expect(isFiltered(filters)).toBe(true);
  });

  it("ignores malformed values instead of failing", () => {
    const filters = parseFilters(new URLSearchParams("minPrice=abc&maxPrice=-5&sort=nonsense&storage=x,256&platforms=,,"));
    expect(filters.minPrice).toBeNull();
    expect(filters.maxPrice).toBeNull();
    expect(filters.sort).toBe("recommended");
    expect(filters.storage).toEqual([256]);
    expect(filters.platforms).toBeNull();
  });

  it("treats platform names case-insensitively", () => {
    expect(parseFilters(new URLSearchParams("platforms=PriceOye,Mega.pk")).platforms).toEqual(["priceoye", "mega"]);
  });

  it("does not count the sort as a filter for the reset control", () => {
    expect(isFiltered({ ...emptyFilters(), sort: "lowestPrice" })).toBe(false);
  });
});

describe("applyFilters", () => {
  it("returns everything when nothing is selected", () => {
    expect(applyFilters(phones, emptyFilters())).toHaveLength(4);
  });

  it("filters by platform, matching seeded and scraped naming alike", () => {
    const result = applyFilters(phones, { ...emptyFilters(), platforms: ["priceoye"] });
    expect(result.map((o) => o._id)).toEqual(["a", "d"]);
  });

  it("filters by price range, inclusive at both ends", () => {
    const result = applyFilters(phones, { ...emptyFilters(), minPrice: 90000, maxPrice: 95000 });
    expect(result.map((o) => o._id)).toEqual(["a", "b"]);
  });

  it("combines facets: within one facet any value matches, across facets all must", () => {
    const result = applyFilters(phones, { ...emptyFilters(), storage: [128, 256], colour: ["black"] });
    expect(result.map((o) => o._id)).toEqual(["a", "b"]);
  });

  it("filters by category, treating a missing category as other", () => {
    const mixed = [...phones, offer("z", { productCategory: undefined })];
    expect(applyFilters(mixed, { ...emptyFilters(), category: "other" }).map((o) => o._id)).toEqual(["z"]);
  });

  it("filters used offers out, and in", () => {
    expect(applyFilters(phones, { ...emptyFilters(), condition: ["used"] }).map((o) => o._id)).toEqual(["c"]);
    expect(applyFilters(phones, { ...emptyFilters(), condition: ["new"] })).toHaveLength(3);
  });
});

describe("discounts", () => {
  it("computes the claimed discount, and none when the original is not above the price", () => {
    expect(claimedDiscount({ price: 80, originalPrice: 100 })).toBeCloseTo(0.2);
    expect(claimedDiscount({ price: 100, originalPrice: 100 })).toBe(0);
    expect(claimedDiscount({ price: 100 })).toBe(0);
  });

  it("counts a doubtful discount as none, so a fake one cannot rank first", () => {
    const fake = { price: 50, originalPrice: 100, discountAnalysis: { isFakeDiscount: true } };
    const anomalous = { price: 50, originalPrice: 100, discountAnomaly: { isAnomalous: true } };
    const suspectPrice = { price: 50, originalPrice: 100, priceCheck: { status: "suspect_low" } };
    for (const doubtful of [fake, anomalous, suspectPrice]) {
      expect(isDiscountDoubtful(doubtful)).toBe(true);
      expect(verifiedDiscount(doubtful)).toBe(0);
    }
    expect(verifiedDiscount({ price: 50, originalPrice: 100 })).toBe(0.5);
  });
});

describe("sortOffers", () => {
  it("keeps the API order for recommended", () => {
    expect(sortOffers(phones, "recommended").map((o) => o._id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by lowest price and by deal score", () => {
    expect(sortOffers(phones, "lowestPrice").map((o) => o._id)).toEqual(["c", "a", "b", "d"]);
    expect(sortOffers(phones, "bestScore").map((o) => o._id)).toEqual(["c", "a", "b", "d"]);
  });

  it("ranks by verified discount and puts a fake discount last, not first", () => {
    const offers = [
      offer("real", { price: 80, originalPrice: 100 }),
      offer("fake", { price: 40, originalPrice: 100, discountAnalysis: { isFakeDiscount: true } }),
      offer("none", { price: 60 }),
    ];
    const order = sortOffers(offers, "highestDiscount").map((o) => o._id);
    expect(order[0]).toBe("real");
    expect(order.indexOf("fake")).toBeGreaterThan(0);
  });

  it("does not change the input", () => {
    const copy = [...phones];
    sortOffers(phones, "lowestPrice");
    expect(phones).toEqual(copy);
  });
});

describe("groups", () => {
  const groups = [
    { productName: "Phone A", offers: [phones[0], phones[3]] },
    { productName: "Phone B", offers: [phones[1]] },
    { productName: "Phone C", offers: [phones[2]] },
  ];

  it("rebuilds groups from the offers that survived a filter and drops empty ones", () => {
    const kept = applyFilters(phones, { ...emptyFilters(), platforms: ["mega"] });
    const result = filterGroups(groups, kept);
    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe("Phone B");
  });

  it("keeps a group's offers together when only some match", () => {
    const kept = applyFilters(phones, { ...emptyFilters(), platforms: ["priceoye"] });
    const result = filterGroups(groups, kept);
    expect(result[0].offers.map((o) => o._id)).toEqual(["a", "d"]);
  });

  it("orders groups by the chosen sort", () => {
    expect(sortGroups(groups, "recommended")[0].productName).toBe("Phone A"); // most offers first
    expect(sortGroups(groups, "lowestPrice")[0].productName).toBe("Phone C"); // cheapest offer first
    expect(sortGroups(groups, "bestScore")[0].productName).toBe("Phone C"); // highest score first
  });

  it("gives a group a stable key that does not depend on its name", () => {
    expect(groupKey(groups[0])).toBe("a");
    expect(groupKey({ productName: "X", offers: [] })).toBe("X");
  });
});

describe("facets", () => {
  it("offers filters for one category at a time", () => {
    const mixed = [...phones, offer("tv1", { productCategory: "tv", screenInches: 55, resolution: "4K" }), offer("tv2", { productCategory: "tv", screenInches: 65, resolution: "FHD" })];
    expect(activeCategory(mixed, "all")).toBe("smartphone");
    expect(activeCategory(mixed, "tv")).toBe("tv");

    const phoneFacets = buildFacets(mixed, "smartphone").map((f) => f.key);
    expect(phoneFacets).toContain("storage");
    expect(phoneFacets).not.toContain("screen");

    const tvFacets = buildFacets(mixed, "tv").map((f) => f.key);
    expect(tvFacets).toEqual(["screen", "resolution"]);
  });

  it("orders storage numerically, resolution best-first, others by popularity, with counts", () => {
    const facets = Object.fromEntries(buildFacets(phones, "smartphone").map((f) => [f.key, f]));
    expect(facets.storage.options.map((o) => o.label)).toEqual(["128 GB", "256 GB", "512 GB"]);
    expect(facets.storage.options.find((o) => o.value === 256).count).toBe(2);
    expect(facets.colour.options.map((o) => o.value).sort()).toEqual(["black", "blue"]);
  });

  it("leaves out a facet with fewer than two options, and never offers 'unknown' PTA", () => {
    const facets = buildFacets(phones, "smartphone");
    expect(facets.find((f) => f.key === "pta").options.map((o) => o.value)).not.toContain("unknown");

    const oneColour = phones.map((o) => ({ ...o, colour: "black" }));
    expect(buildFacets(oneColour, "smartphone").some((f) => f.key === "colour")).toBe(false);
  });

  it("orders resolutions best to worst", () => {
    const tvs = ["FHD", "4K", "HD", "8K"].map((resolution, i) => offer(`t${i}`, { productCategory: "tv", resolution }));
    const facet = buildFacets(tvs, "tv").find((f) => f.key === "resolution");
    expect(facet.options.map((o) => o.value)).toEqual(["8K", "4K", "FHD", "HD"]);
  });

  it("offers a RAM filter for laptops (the previous UI never rendered one)", () => {
    const laptops = [8, 16, 16].map((ramGb, i) => offer(`l${i}`, { productCategory: "laptop", ramGb }));
    expect(buildFacets(laptops, "laptop").some((f) => f.key === "ram")).toBe(true);
  });
});

describe("counts and bounds", () => {
  it("counts categories and stores, most common first", () => {
    expect(categoryCounts([...phones, offer("x", { productCategory: "tv" })])[0]).toEqual({ category: "smartphone", count: 4 });
    const stores = platformOptions(phones);
    expect(stores[0]).toMatchObject({ id: "priceoye", name: "PriceOye", count: 2 });
  });

  it("finds price bounds", () => {
    expect(priceBounds(phones)).toEqual({ min: 70000, max: 120000 });
    expect(priceBounds([])).toEqual({ min: 0, max: 0 });
  });
});
