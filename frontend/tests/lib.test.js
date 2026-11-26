import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { formatPrice, formatCapacity, formatPercent, timeAgo, formatCondition, formatPta } from "../src/lib/format.js";
import { safeExternalUrl, offerLink } from "../src/lib/safeLink.js";
import { canonicalPlatform, platformName } from "../src/lib/platforms.js";
import { cardBadges, offerFlags, marketVerdict, recommendationOf, RECOMMENDATIONS } from "../src/lib/verdicts.js";
import { summarizeOffers, newestScrape } from "../src/lib/summary.js";

describe("format", () => {
  it("formats prices with fixed grouping, and shows a dash for nonsense", () => {
    expect(formatPrice(650000)).toBe("PKR 650,000");
    expect(formatPrice(65000.4)).toBe("PKR 65,000");
    expect(formatPrice(undefined)).toBe("—");
    expect(formatPrice("abc")).toBe("—");
  });

  it("formats capacities", () => {
    expect(formatCapacity(256)).toBe("256 GB");
    expect(formatCapacity(1024)).toBe("1 TB");
    expect(formatCapacity(2048)).toBe("2 TB");
  });

  it("formats percentages and labels", () => {
    expect(formatPercent(0.254)).toBe("25%");
    expect(formatPercent(0.004)).toBe("");
    expect(formatCondition("open_box")).toBe("Open box");
    expect(formatPta("non_pta")).toBe("Non-PTA");
    expect(formatCondition("mystery")).toBe("mystery");
  });

  it("says how long ago in plain words", () => {
    const now = new Date("2026-09-30T12:00:00Z").getTime();
    const ago = (ms) => new Date(now - ms).toISOString();
    expect(timeAgo(ago(20 * 1000), now)).toBe("just now");
    expect(timeAgo(ago(5 * 60 * 1000), now)).toBe("5 min ago");
    expect(timeAgo(ago(3 * 3600 * 1000), now)).toBe("3 h ago");
    expect(timeAgo(ago(24 * 3600 * 1000), now)).toBe("1 day ago");
    expect(timeAgo(ago(3 * 24 * 3600 * 1000), now)).toBe("3 days ago");
    expect(timeAgo(ago(40 * 24 * 3600 * 1000), now)).toMatch(/2026/);
    expect(timeAgo("not a date", now)).toBe("");
    expect(timeAgo(undefined, now)).toBe("");
  });
});

describe("safeExternalUrl", () => {
  it("allows only http and https", () => {
    expect(safeExternalUrl("https://priceoye.pk/mobiles/x")).toBe("https://priceoye.pk/mobiles/x");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
  });

  it("refuses anything else, without throwing", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "//evil.test", "not a url", "", null, undefined, 42]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
  });

  it("picks an offer's product page, then its source URL, then nothing", () => {
    expect(offerLink({ productUrl: "https://a.test/p", sourceUrl: "https://b.test/p" })).toBe("https://a.test/p");
    expect(offerLink({ productUrl: "javascript:alert(1)", sourceUrl: "https://b.test/p" })).toBe("https://b.test/p");
    expect(offerLink({ productUrl: "", sourceUrl: "" })).toBeNull();
  });
});

describe("platforms", () => {
  it("treats scraped ids and seeded display names as the same store", () => {
    for (const name of ["priceoye", "PriceOye", "PRICEOYE", "priceoye.pk"]) expect(canonicalPlatform(name)).toBe("priceoye");
    expect(canonicalPlatform("Mega.pk")).toBe("mega");
  });

  it("shows a proper display name, and falls back for an unknown store", () => {
    expect(platformName("ishopping")).toBe("iShopping");
    expect(platformName("zz-new-store")).toBe("zz-new-store");
  });
});

describe("verdicts", () => {
  it("returns every applicable warning for an offer, with its reason", () => {
    const flags = offerFlags({
      discountAnalysis: { classification: "likely_fake", reason: "was price never seen" },
      discountAnomaly: { isAnomalous: true, reason: "above what 4 stores charge" },
      priceCheck: { status: "suspect_low", reason: "90% below others" },
    });
    expect(flags.map((f) => f.id)).toEqual(["discount", "market", "price"]);
    expect(flags[0]).toMatchObject({ tone: "bad", label: "Fake discount", reason: "was price never seen" });
    expect(flags[2].label).toBe("Unusual price");
  });

  it("says which kind of suspicious discount it is, and an unconfirmed one does not hide a good deal", () => {
    const unconfirmed = offerFlags({ discountAnalysis: { classification: "suspicious", suspicionKind: "unconfirmed", reason: "r" } });
    expect(unconfirmed[0]).toMatchObject({ tone: "neutral", label: "Unconfirmed discount" });
    const never = offerFlags({ discountAnalysis: { classification: "suspicious", suspicionKind: "never_charged", reason: "r" } });
    expect(never[0]).toMatchObject({ tone: "caution", label: 'Never sold at "was" price' });
    const plain = offerFlags({ discountAnalysis: { classification: "suspicious", suspicionKind: null, reason: "r" } });
    expect(plain[0]).toMatchObject({ tone: "caution", label: "Suspicious discount" });
    const good = { recommendation: { action: "GOOD_DEAL", reason: "cheap" }, price: 100 };
    expect(cardBadges({ ...good, discountAnalysis: { classification: "suspicious", suspicionKind: "unconfirmed" } }).map((b) => b.label))
      .toEqual(["Good deal", "Unconfirmed discount"]);
    expect(cardBadges({ ...good, discountAnalysis: { classification: "suspicious", suspicionKind: "never_charged" } }).map((b) => b.label))
      .toEqual(['Never sold at "was" price']);
  });

  it("says nothing for an ordinary offer", () => {
    expect(offerFlags({ discountAnalysis: { classification: "no_claimed_discount" }, priceCheck: { status: "plausible" } })).toEqual([]);
    expect(offerFlags({})).toEqual([]);
  });

  it("falls back safely for an unknown recommendation", () => {
    expect(recommendationOf({ recommendation: { action: "BUY_NOW" } })).toBe(RECOMMENDATIONS.BUY_NOW);
    expect(recommendationOf({})).toBe(RECOMMENDATIONS.NO_HISTORY);
    expect(recommendationOf({ recommendation: { action: "SOMETHING_NEW" } })).toBe(RECOMMENDATIONS.NO_HISTORY);
  });

  it("reads the cross-store check", () => {
    expect(marketVerdict({ discountAnomaly: { status: "consistent", reason: "ok" } })).toMatchObject({ label: "In line with other stores", tone: "good" });
    expect(marketVerdict({ discountAnomaly: { status: "anomalous" } }).tone).toBe("caution");
    expect(marketVerdict({})).toBeNull();
  });
});

describe("summarizeOffers", () => {
  // These offers are dated 29 and 30 September. An offer not checked for 14 days is left out of the prices (lib/freshness.js), so with
  // the real clock they stopped counting on 14 October and the tests failed. The clock is set to the day after the data.
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-01T12:00:00Z")); });
  afterAll(() => vi.useRealTimers());

  const offers = [
    { _id: "a", platform: "priceoye", price: 100, dealScore: 70, lastScrapedAt: "2026-09-30T10:00:00Z" },
    { _id: "b", platform: "PriceOye", price: 120, dealScore: 90, lastScrapedAt: "2026-09-30T11:00:00Z" },
    { _id: "c", platform: "mega", price: 110, dealScore: 60, lastScrapedAt: "2026-09-29T09:00:00Z" },
  ];

  it("summarises count, stores, lowest, average and best deal", () => {
    const s = summarizeOffers(offers);
    expect(s).toMatchObject({ count: 3, platformCount: 2, average: 110 });
    expect(s.lowest._id).toBe("a");
    expect(s.bestDeal._id).toBe("b");
  });

  it("reports the real newest scrape time, not the current time", () => {
    expect(newestScrape(offers).toISOString()).toBe("2026-09-30T11:00:00.000Z");
    expect(newestScrape([{ price: 1 }])).toBeNull();
  });

  it("never presents a flagged offer as the lowest price or the best deal", () => {
    const withBogus = [...offers, { _id: "bogus", platform: "telemart", price: 10, dealScore: 99, priceCheck: { status: "suspect_low" } }];
    const s = summarizeOffers(withBogus);
    expect(s.lowest._id).toBe("a");
    expect(s.bestDeal._id).toBe("b");
    expect(s.count).toBe(4);
  });

  it("counts flagged discounts and copes with no offers", () => {
    expect(summarizeOffers([{ _id: "x", platform: "a", price: 1, discountAnalysis: { isFakeDiscount: true } }]).flagged).toBe(1);
    expect(summarizeOffers([])).toMatchObject({ count: 0, lowest: null, bestDeal: null, updatedAt: null });
  });
});

describe("an offer that cannot be bought (2026-11-18)", () => {
  it("is never 'Buy now' or 'Good deal', and says why", async () => {
    const { offerVerdict, availabilityOf } = await import("../src/lib/verdicts.js");
    const soon = { inStock: false, availability: "coming_soon", recommendation: { action: "BUY_NOW", reason: "lowest" }, price: 47900 };
    expect(offerVerdict(soon)).toMatchObject({ label: "Coming soon", tone: "neutral" });
    expect(offerVerdict({ ...soon, availability: "discontinued" }).label).toBe("Discontinued");
    expect(offerVerdict({ ...soon, availability: null }).label).toBe("Out of stock");
    expect(offerVerdict({ ...soon, inStock: true }).label).toBe("Buy now");
    expect(offerVerdict({ ...soon, recommendation: { action: "WAIT" } }).label).toBe("Wait");
    expect(availabilityOf({ inStock: true })).toBe(null);
  });
});

describe("PTA approved by maker (2026-11-18)", () => {
  it("shows approved, and says it comes from the maker, not the store", async () => {
    const { ptaFlag } = await import("../src/lib/pta.js");
    const flag = ptaFlag({ ptaStatus: "pta_approved", ptaSource: "brand" });
    expect(flag).toMatchObject({ label: "PTA approved", tone: "good" });
    expect(flag.reason).toMatch(/does not say/);
  });
});

describe("PTA approved by the store's own category (2026-11-18)", () => {
  it("shows approved and says where it comes from", async () => {
    const { ptaFlag } = await import("../src/lib/pta.js");
    const flag = ptaFlag({ ptaStatus: "pta_approved", ptaSource: "store_category" });
    expect(flag).toMatchObject({ label: "PTA approved", tone: "good" });
    expect(flag.reason).toMatch(/PTA-approved phones/);
  });
});

describe("out-of-date offers and products sort last (2026-11-18)", () => {
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  it("puts an offer not checked for a week below current ones, under every sort", async () => {
    const { sortOffers } = await import("../src/lib/filters.js");
    const offers = [{ _id: "old", price: 100, dealScore: 90, lastScrapedAt: ago(9) }, { _id: "new", price: 200, dealScore: 50, lastScrapedAt: ago(0) }];
    for (const sort of ["recommended", "lowestPrice", "bestScore", "highestDiscount"]) expect(sortOffers(offers, sort).map((o) => o._id)).toEqual(["new", "old"]);
  });
  it("puts a product with no current offer below the others", async () => {
    const { sortGroups } = await import("../src/lib/filters.js");
    const groups = [
      { productName: "old", offers: [{ price: 100, dealScore: 90, lastScrapedAt: ago(9) }, { price: 110, dealScore: 80, lastScrapedAt: ago(10) }] },
      { productName: "new", offers: [{ price: 200, dealScore: 50, lastScrapedAt: ago(0) }] },
    ];
    for (const sort of ["recommended", "lowestPrice", "bestScore"]) expect(sortGroups(groups, sort).map((g) => g.productName)).toEqual(["new", "old"]);
  });
});

describe("counts under filters (2026-11-18, iPhone 15 Pro Max at 256 and 512 GB)", () => {
  it("counts each store's offers that pass the other filters, and keeps every store listed", async () => {
    const { platformOptions, emptyFilters } = await import("../src/lib/filters.js");
    const offers = [
      { platform: "alfamall", storageGb: 256, price: 1 }, { platform: "alfamall", storageGb: 128, price: 1 },
      { platform: "digimall", storageGb: null, price: 1 },
    ];
    const filters = { ...emptyFilters(), storage: [256, 512] };
    expect(platformOptions(offers, filters)).toEqual([
      { id: "alfamall", name: "AlfaMall", count: 1 },
      { id: "digimall", name: "DigiMall", count: 0 },
    ]);
    expect(platformOptions(offers).find((o) => o.id === "alfamall").count).toBe(2);
  });

  it("says what a card's count leaves out", async () => {
    const { offerCountText } = await import("../src/lib/summary.js");
    expect(offerCountText({ count: 1, platformCount: 1, excluded: 1, outOfDate: 0 })).toBe("1 offer from 1 store (and 1 used or open box)");
    expect(offerCountText({ count: 2, platformCount: 2, excluded: 0, outOfDate: 0 })).toBe("2 offers from 2 stores");
  });
});

describe("a pasted Pakistani store's link (audit 2026-11-18)", () => {
  it("is not told its price is in another currency", async () => {
    const { isPakistaniHost } = await import("../src/lib/productLink.js");
    expect(isPakistaniHost("ishopping.pk")).toBe(true);
    expect(isPakistaniHost("www.daraz.pk")).toBe(true);
    expect(isPakistaniHost("alfamall.com")).toBe(true);
    expect(isPakistaniHost("amazon.com")).toBe(false);
    expect(isPakistaniHost(null)).toBe(false);
  });
});

describe("storage not stated is an option of its own (audit S-014, 2026-11-19)", () => {
  it("lists it last and keeps offers without storage when it is chosen", async () => {
    const { buildFacets, applyFilters, emptyFilters } = await import("../src/lib/filters.js");
    const offers = [
      { productCategory: "smartphone", storageGb: 256, price: 1 }, { productCategory: "smartphone", storageGb: 128, price: 1 },
      { productCategory: "smartphone", storageGb: null, price: 1 },
    ];
    const storage = buildFacets(offers, "smartphone").find((f) => f.key === "storage");
    expect(storage.options.map((o) => o.label)).toEqual(["128 GB", "256 GB", "Storage not stated"]);
    expect(applyFilters(offers, { ...emptyFilters(), storage: [256, 0] })).toHaveLength(2);
  });
});

describe("a store whose listings do not state stock (audit S-008)", () => {
  it("says 'Stock not confirmed' for Mega, 'In stock' elsewhere, and why it cannot be bought when it cannot", async () => {
    const { stockLabelOf } = await import("../src/lib/verdicts.js");
    expect(stockLabelOf({ platform: "mega", inStock: true })).toMatchObject({ label: "Stock not confirmed", known: false });
    expect(stockLabelOf({ platform: "priceoye", inStock: true })).toMatchObject({ label: "In stock", known: true });
    expect(stockLabelOf({ platform: "mega", inStock: false, availability: "coming_soon" })).toMatchObject({ label: "Coming soon" });
  });
});

describe("a price far below the specs price (audit S-016, 2026-11-19)", () => {
  it("is not called a bargain: the model prices the specs, not the year", async () => {
    const { fairPriceGap } = await import("../src/lib/fairPrice.js");
    expect(fairPriceGap(258825, { price: 369519 })).toMatchObject({ tone: "neutral", text: expect.stringMatching(/^30% below it: priced from the specs/) });
    expect(fairPriceGap(92000, { price: 100000 })).toEqual({ tone: "good", text: "8% below it" });
  });
});

describe("swiping a carousel on a phone (2026-11-19)", () => {
  it("reads a sideways move as a swipe and leaves a vertical one to the page", async () => {
    const { swipeDirection } = await import("../src/hooks/useSwipe.js");
    expect(swipeDirection(-80, 10)).toBe("left");
    expect(swipeDirection(90, -5)).toBe("right");
    expect(swipeDirection(-20, 0)).toBe(null); // too short: a tap
    expect(swipeDirection(-60, 120)).toBe(null); // a scroll
  });
});

describe("a product's storage on the product page (2026-11-27)", () => {
  it("does not take the RAM for the storage: 'Samsung A17 5G 8GB RAM' states no storage", async () => {
    const { variantOf } = await import("../src/lib/variants.js");
    const offer = { _id: "x", price: 96799, platform: "digimall", productCategory: "smartphone", inStock: true };
    expect(variantOf({ productName: "Samsung A17 5G 8GB RAM", offers: [offer] }).storage).toBeNull();
    expect(variantOf({ productName: "Samsung A17 5G 8GB RAM", offers: [offer] }).ram).toBe(8);
    expect(variantOf({ productName: "Samsung Galaxy A17 8GB RAM 256GB Storage", offers: [offer] }).storage).toBe(256);
  });
});
