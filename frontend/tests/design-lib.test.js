import { describe, it, expect } from "vitest";
import { featuredCategories, isKnownCategory, FEATURED_CATEGORIES } from "../src/lib/categories.js";
import { GOOD_DEAL_MARGIN, briefReason, cardBadges, offerVerdict, reasonPoints } from "../src/lib/verdicts.js";
import { pageTitle, SITE_TITLE } from "../src/hooks/usePageTitle.js";

describe("featuredCategories", () => {
  const counts = [
    { category: "smartphone", count: 1368 }, { category: "tv", count: 571 }, { category: "laptop", count: 371 },
    { category: "accessory", count: 235 }, { category: "other", count: 217 }, { category: "smartwatch", count: 148 },
    { category: "tablet", count: 104 }, { category: "appliance", count: 101 }, { category: "headphones", count: 79 },
    { category: "monitor", count: 23 },
  ];

  it("keeps only the categories the site is about, biggest first, with readable names", () => {
    // Monitors are featured since 2026-10-22; "accessory", "other" and the leftover "appliance" bucket are not.
    expect(featuredCategories(counts).map((t) => t.category)).toEqual(["smartphone", "tv", "laptop", "smartwatch", "tablet", "headphones", "monitor"]);
    expect(featuredCategories(counts)[0]).toEqual({ category: "smartphone", name: "Smartphones", count: 1368 });
  });

  it("hides a thin category so no tile looks empty", () => {
    expect(featuredCategories([{ category: "tablet", count: 19 }, { category: "tv", count: 20 }]).map((t) => t.category)).toEqual(["tv"]);
    expect(featuredCategories([{ category: "tablet", count: 5 }], { min: 1 })).toHaveLength(1);
  });

  it("copes with a missing, empty or malformed list and string counts", () => {
    expect(featuredCategories()).toEqual([]);
    expect(featuredCategories([null, {}, { category: "tv" }, { category: "tv", count: "abc" }])).toEqual([]);
    expect(featuredCategories([{ category: "tv", count: "571" }])[0].count).toBe(571);
  });

  it("breaks a tie by the site's own category order", () => {
    const tied = featuredCategories([{ category: "laptop", count: 50 }, { category: "tv", count: 50 }]);
    expect(tied.map((t) => t.category)).toEqual(["tv", "laptop"]);
  });

  it("knows which category ids exist, and not inherited object keys", () => {
    expect(isKnownCategory("smartphone")).toBe(true);
    expect(isKnownCategory("accessory")).toBe(true);
    for (const bad of ["toaster", "", "constructor", "__proto__", "toString", undefined, null]) expect(isKnownCategory(bad), String(bad)).toBe(false);
    expect(FEATURED_CATEGORIES.every(isKnownCategory)).toBe(true);
  });
});

describe("cardBadges", () => {
  const offer = (action, classification, extra = {}) => ({
    recommendation: { action, reason: "because" },
    discountAnalysis: classification ? { classification, reason: "why" } : undefined,
    ...extra,
  });

  it("shows the recommendation, then any warnings", () => {
    const badges = cardBadges(offer("FAIR_PRICE", "suspicious"));
    expect(badges.map((b) => b.label)).toEqual(["Fair price", "Suspicious discount"]);
    expect(badges[0].reason).toBe("because");
  });

  it("never shows a good recommendation next to a suspicious discount either (live: both on one iPhone card)", () => {
    expect(cardBadges(offer("GOOD_DEAL", "suspicious")).map((b) => b.label)).toEqual(["Suspicious discount"]);
  });

  it("keeps a good recommendation next to a neutral flag", () => {
    expect(cardBadges(offer("GOOD_DEAL", "unverified_discount")).map((b) => b.label)).toEqual(["Good deal", "Unverified discount"]);
  });

  it("never shows a good recommendation next to a fake discount: the warning replaces it", () => {
    const badges = cardBadges(offer("GOOD_DEAL", "likely_fake"));
    expect(badges.map((b) => b.label)).toEqual(["Fake discount"]);
    expect(cardBadges(offer("BUY_NOW", "likely_fake")).map((b) => b.label)).toEqual(["Fake discount"]);
  });

  it("keeps a cautious recommendation next to a bad flag (they agree)", () => {
    expect(cardBadges(offer("OVERPRICED", "likely_fake")).map((b) => b.label)).toEqual(["Overpriced", "Fake discount"]);
    expect(cardBadges(offer("WAIT", "likely_fake")).map((b) => b.label)).toEqual(["Wait", "Fake discount"]);
  });

  it("does not call an unusual price a good deal: the site never counts it as the lowest price or a saving", () => {
    const labels = cardBadges({ ...offer("GOOD_DEAL"), priceCheck: { status: "suspect_low", reason: "far below" } }).map((b) => b.label);
    expect(labels).toEqual(["Unusual price"]);
  });

  it("passes the product's lowest price on, so a dear offer is not called a good deal", () => {
    const dear = { ...offer("GOOD_DEAL"), price: 473999 };
    expect(cardBadges(dear, { lowestPrice: 439999 }).map((b) => b.label)).toEqual(["Fair price"]);
    expect(cardBadges(dear).map((b) => b.label)).toEqual(["Good deal"]); // nothing to compare with
  });

  it("limits the warnings shown, and falls back safely for an offer with no analysis", () => {
    const many = { ...offer("FAIR_PRICE", "suspicious"), discountAnomaly: { isAnomalous: true }, priceCheck: { status: "suspect_high" } };
    expect(cardBadges(many)).toHaveLength(3); // recommendation + 2 warnings
    expect(cardBadges(many, { maxFlags: 1 })).toHaveLength(2);
    expect(cardBadges({}).map((b) => b.label)).toEqual(["Not enough history"]);
    expect(cardBadges(undefined).map((b) => b.label)).toEqual(["Not enough history"]);
  });
});

describe("offerVerdict: a good deal is relative to the product's lowest price", () => {
  const good = (price) => ({ price, recommendation: { action: "GOOD_DEAL", reason: "Score 72." } });

  it("keeps the server's verdict and reason within the margin", () => {
    expect(GOOD_DEAL_MARGIN).toBe(0.05);
    expect(offerVerdict(good(439999), { lowestPrice: 439999 })).toEqual({ label: "Good deal", tone: "good", reason: "Score 72." });
    expect(offerVerdict(good(461998), { lowestPrice: 439999 }).label).toBe("Good deal"); // 4.99% above
  });

  it("calls a dearer offer a fair price and says how much more it is (live: PriceOye's iPhone 17 Pro, 8% above Shophive)", () => {
    expect(offerVerdict(good(473999), { lowestPrice: 439999 })).toEqual({
      label: "Fair price", tone: "neutral",
      reason: "PKR 34,000 more than the lowest price we found for this product (PKR 439,999).",
    });
    expect(offerVerdict({ ...good(473999), recommendation: { action: "BUY_NOW" } }, { lowestPrice: 439999 }).label).toBe("Fair price");
  });

  it("leaves cautious verdicts alone, and needs a lowest price to compare with", () => {
    expect(offerVerdict({ price: 500000, recommendation: { action: "OVERPRICED", reason: "x" } }, { lowestPrice: 400000 }).label).toBe("Overpriced");
    expect(offerVerdict(good(473999)).label).toBe("Good deal");
    expect(offerVerdict(good(473999), { lowestPrice: 0 }).label).toBe("Good deal");
    expect(offerVerdict(undefined)).toEqual({ label: "Not enough history", tone: "neutral", reason: "" });
  });
});

describe("server reasons", () => {
  const joined = "The claimed original price is significantly higher than usual. The current price is not lower. It is PKR 1.5 lakh.";

  it("splits a joined reason into its sentences, and keeps decimals and a single sentence whole", () => {
    expect(reasonPoints(joined)).toEqual([
      "The claimed original price is significantly higher than usual.", "The current price is not lower.", "It is PKR 1.5 lakh.",
    ]);
    expect(reasonPoints("One sentence only.")).toEqual(["One sentence only."]);
    expect(reasonPoints(undefined)).toEqual([]);
  });

  it("gives the first sentence for a one-line note", () => {
    expect(briefReason(joined)).toBe("The claimed original price is significantly higher than usual.");
    expect(briefReason("")).toBe("");
  });
});

describe("pageTitle", () => {
  it("names the page before the site, and uses the site's title when there is no page title", () => {
    expect(pageTitle("iphone 17 pro prices")).toBe("iphone 17 pro prices · ShopSavvy");
    expect(pageTitle("")).toBe(SITE_TITLE);
    expect(pageTitle("   ")).toBe(SITE_TITLE);
    expect(pageTitle(undefined)).toBe(SITE_TITLE);
  });
});
