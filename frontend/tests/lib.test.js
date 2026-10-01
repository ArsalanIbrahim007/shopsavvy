import { describe, it, expect } from "vitest";
import { formatPrice, formatCapacity, formatPercent, timeAgo, formatCondition, formatPta } from "../src/lib/format.js";
import { safeExternalUrl, offerLink } from "../src/lib/safeLink.js";
import { canonicalPlatform, platformName } from "../src/lib/platforms.js";
import { offerFlags, marketVerdict, recommendationOf, RECOMMENDATIONS } from "../src/lib/verdicts.js";
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
