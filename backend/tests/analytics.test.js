// The analytics endpoints (audit, 2026-11-12, finding 9): only the stores the site shows, an exact store name, and a rate limit.
import { describe, it, expect, vi, afterEach } from "vitest";

import Listing from "../src/models/listing.model.js";
import PriceHistory from "../src/models/priceHistory.model.js";
import { DISABLED_PLATFORMS } from "../src/config/platforms.js";
import { getAnalyticsOverview, getPlatformAnalytics, getPriceTrendAnalytics } from "../src/services/analytics/analytics.service.js";

afterEach(() => vi.restoreAllMocks());

const hidesDisabled = (filter) => DISABLED_PLATFORMS.every((p) => filter?.platform?.$nin?.includes(p));

describe("analytics count only the stores the site shows", () => {
  it("every count and every pipeline of the overview and the per-store figures leaves out the switched-off stores", async () => {
    const counts = [];
    const pipelines = [];
    vi.spyOn(Listing, "countDocuments").mockImplementation(async (filter) => { counts.push(filter); return 10; });
    vi.spyOn(PriceHistory, "countDocuments").mockImplementation(async (filter) => { counts.push(filter); return 10; });
    vi.spyOn(Listing, "aggregate").mockImplementation(async (pipeline) => { pipelines.push(pipeline); return []; });

    await getAnalyticsOverview();
    await getPlatformAnalytics();

    expect(counts.length).toBeGreaterThanOrEqual(5);
    expect(counts.every(hidesDisabled)).toBe(true);
    expect(pipelines.length).toBeGreaterThanOrEqual(5);
    expect(pipelines.every((pipeline) => hidesDisabled(pipeline[0].$match))).toBe(true);
  });

  it("price trends take a store's exact name, never a pattern, and nothing for a switched-off store", async () => {
    const matches = [];
    vi.spyOn(PriceHistory, "aggregate").mockImplementation(async (pipeline) => { matches.push(pipeline[0].$match); return []; });

    await getPriceTrendAnalytics({ days: 30 });
    await getPriceTrendAnalytics({ days: 30, platform: "PriceOye" });
    await getPriceTrendAnalytics({ days: 30, platform: "(a+)+$" });
    await getPriceTrendAnalytics({ days: 30, platform: "Daraz" });

    expect(hidesDisabled(matches[0])).toBe(true);
    expect(matches[1].platform).toBe("priceoye");
    expect(matches[2].platform).toBe("(a+)+$"); // compared as text: matches no store, runs no pattern
    expect(matches[3].platform).toEqual({ $in: [] });
  });
});

describe("the analytics routes are rate limited", () => {
  it("each of the three routes runs the analytics limiter before its handler", async () => {
    const { default: router } = await import("../src/routes/analytics.routes.js");
    const { analyticsLimiter } = await import("../src/middleware/rateLimit.middleware.js");
    const routes = router.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, handlers: layer.route.stack.map((s) => s.handle) }));
    expect(routes.map((r) => r.path)).toEqual(["/overview", "/platforms", "/price-trends"]);
    for (const route of routes) expect(route.handlers[0]).toBe(analyticsLimiter);
  });
});
