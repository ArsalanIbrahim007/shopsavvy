import { describe, it, expect, vi, afterAll, afterEach } from "vitest";

import Listing from "../src/models/listing.model.js";
import { closeGroupingPool } from "../src/services/grouping.service.js";
import { DEAL_CATEGORIES } from "../src/services/dealsFeed.service.js";
import { buildScheduledQueryPlan, deriveQuery, planWeight, PLAN_CATEGORY_WEIGHT } from "../src/services/scheduledScraping.service.js";

afterEach(() => vi.restoreAllMocks());
afterAll(() => closeGroupingPool());

const NOW = Date.parse("2026-11-18T12:00:00Z");
const DAY = 86400000;
let n = 0;
const listing = (platform, title, productCategory) => ({
  _id: `6a78a2af9c96f297ede78${String(++n).padStart(3, "0")}`, platform, title, normalizedTitle: "x", price: 50000 + n * 1000,
  productCategory, inStock: true, lastScrapedAt: new Date(NOW - 2 * DAY),
});
// Two stores each, so every product is a "compared" one.
const pair = (title, category) => [listing("priceoye", title, category), listing("mega", title, category)];

const PHONE = "Samsung Galaxy A17 6GB 128GB";
const CASE = "Spigen Rugged Armor Case Galaxy A17";
const CAMERA = "Canon EOS R50 Mirrorless Camera";

const plan = async (lastRunDaysAgo) => {
  vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => [...pair(PHONE, "smartphone"), ...pair(CASE, "accessory"), ...pair(CAMERA, "camera")] });
  const lastQueried = new Map(Object.entries(lastRunDaysAgo).filter(([, d]) => d !== null).map(([t, d]) => [deriveQuery(t), NOW - d * DAY]));
  return (await buildScheduledQueryPlan({ now: NOW, lastQueried, staleSingles: 0 })).map((e) => e.query);
};

describe("planWeight", () => {
  it("gives the site's ten main categories full weight, accessories a quarter, other electronics half", () => {
    for (const category of DEAL_CATEGORIES) expect(planWeight(category)).toBe(PLAN_CATEGORY_WEIGHT.main);
    expect(planWeight("accessory")).toBe(0.25);
    expect(planWeight("camera")).toBe(0.5);
    expect(planWeight("appliance")).toBe(0.5);
  });
});

describe("buildScheduledQueryPlan orders by the wait, weighted by category", () => {
  it("puts a phone run yesterday before an accessory run three days ago (3 x 0.25 < 1)", async () => {
    // weighted waits: phone 1 x 1 = 1, accessory 3 x 0.25 = 0.75, camera 1 x 0.5 = 0.5
    expect(await plan({ [PHONE]: 1, [CASE]: 3, [CAMERA]: 1 })).toEqual([deriveQuery(PHONE), deriveQuery(CASE), deriveQuery(CAMERA)]);
  });

  it("still brings the accessory round once it has waited four times as long, so none goes stale for ever", async () => {
    expect((await plan({ [PHONE]: 1, [CASE]: 5, [CAMERA]: 1 }))[0]).toBe(deriveQuery(CASE));
  });

  it("weights other electronics at half: a camera waiting 3 days goes after a phone waiting 2, before one waiting 1", async () => {
    expect(await plan({ [PHONE]: 2, [CASE]: 1, [CAMERA]: 3 })).toEqual([deriveQuery(PHONE), deriveQuery(CAMERA), deriveQuery(CASE)]);
    expect((await plan({ [PHONE]: 1, [CASE]: 1, [CAMERA]: 3 }))[0]).toBe(deriveQuery(CAMERA));
  });

  it("runs never-run queries before any that ran, main categories first", async () => {
    expect(await plan({ [PHONE]: null, [CASE]: null, [CAMERA]: 30 })).toEqual([deriveQuery(PHONE), deriveQuery(CASE), deriveQuery(CAMERA)]);
  });
});
