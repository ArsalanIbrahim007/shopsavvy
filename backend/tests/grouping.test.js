import { describe, it, expect, afterAll } from "vitest";

import { groupListings, OFFLOAD_THRESHOLD, closeGroupingPool, groupingPoolStats, computeDealsOffThread, getGroupingPool } from "../src/services/grouping.service.js";
import { groupAndRecommend } from "../src/services/groupingJob.service.js";

const NOW = Date.now();

const listing = (i, title, platform, price) => ({
  _id: `id${i}`, title, normalizedTitle: title.toLowerCase(), platform, price, originalPrice: null, inStock: true,
  productCategory: "smartphone", ptaStatus: "pta_approved", lastScrapedAt: new Date(NOW).toISOString(),
  priceHistory: [{ price: price + 500, recordedAt: new Date(NOW - 5 * 86400000) }, { price, recordedAt: new Date(NOW) }],
});

// Three stores selling the same phones, plus some unrelated ones.
const realistic = () => {
  const out = [];
  let i = 0;
  for (const [title, base] of [["Samsung Galaxy A17 8GB 256GB", 60000], ["Samsung Galaxy A57 8GB 256GB", 110000], ["Infinix Hot 60i 8GB 128GB", 38000]]) {
    for (const [k, platform] of ["priceoye", "mega", "shophive"].entries()) out.push(listing(i++, title, platform, base + k * 1500));
  }
  return out;
};

// n different phones with mostly shared words: every one becomes its own group and each is
// compared with all the earlier ones through the trained model, the slow O(n^2) case
// (200 of them take about half a second).
const unrelated = (n) => Array.from({ length: n }, (_, i) =>
  listing(i, `Samsung Galaxy A${10 + i} 5G Smartphone 8GB 256GB Black`, "priceoye", 50000 + i));

afterAll(() => closeGroupingPool());

describe("groupListings", () => {
  it("gives the same groups whether it runs in-thread or in a worker", async () => {
    const listings = realistic();
    const inThread = await groupListings(listings, { threshold: 1000 });
    const inWorker = await groupListings(listings, { threshold: 0 });

    expect(inWorker).toEqual(inThread);
    expect(inWorker.length).toBeGreaterThan(0);
    expect(inWorker[0].offers[0].recommendation).toBeTruthy(); // recommendations were attached
  });

  it("matches the plain grouping function", async () => {
    const listings = realistic();
    const direct = groupAndRecommend(listings.map((l) => ({ ...l })));
    expect(await groupListings(listings, { threshold: 0 })).toEqual(direct);
  });

  it("returns string ids in both paths, and does not change the caller's listings", async () => {
    const listings = realistic().map((l, i) => ({ ...l, _id: { toString: () => `obj${i}`, valueOf: () => i } }));
    const before = JSON.stringify(listings);

    for (const threshold of [1000, 0]) {
      const groups = await groupListings(listings, { threshold });
      for (const group of groups) for (const offer of group.offers) expect(typeof offer._id).toBe("string");
    }
    expect(JSON.stringify(listings)).toBe(before);
  });

  it("supports the rule strategy and skipping recommendations", async () => {
    const groups = await groupListings(realistic(), { strategy: "rule", recommend: false, threshold: 0 });
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].offers[0].recommendation).toBeUndefined();
  });

  it("keeps small sets in-thread (no worker is started for them)", async () => {
    await closeGroupingPool();
    await groupListings(realistic()); // 9 listings, well under the threshold
    expect(groupingPoolStats().workers).toBe(0);
    expect(OFFLOAD_THRESHOLD).toBeGreaterThan(9);
  });

  it("returns an empty list for no listings", async () => {
    expect(await groupListings([])).toEqual([]);
  });
});

describe("main-thread responsiveness", () => {
  // Measures how late a 10 ms timer fires while the grouping runs.
  async function worstTimerLag(work) {
    let worst = 0;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      worst = Math.max(worst, now - last - 10);
      last = now;
    }, 10);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let it tick
    last = Date.now();
    await work();
    // A freeze only shows once the timer gets to run again, so give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 40));
    clearInterval(timer);
    return worst;
  }

  it("a worker keeps the main thread free while the same work in-thread blocks it", async () => {
    const listings = unrelated(300);

    await groupListings(unrelated(3), { threshold: 0 }); // start the worker first so its start-up is not counted

    const offloaded = await worstTimerLag(() => groupListings(listings, { threshold: 0 }));
    const blocked = await worstTimerLag(() => groupListings(listings, { threshold: 100000 }));

    expect(blocked).toBeGreaterThan(300); // proves the test would notice a freeze
    expect(offloaded).toBeLessThan(150);
  }, 60000);
});

describe("grouping lanes", () => {
  it("runs cache warm-ups in the background lane, leaving a worker for a shopper's search", async () => {
    await closeGroupingPool();
    getGroupingPool().warm();
    await groupListings(realistic(), { threshold: 0 }); // wait until the workers are up

    const warmups = [groupListings(unrelated(120), { threshold: 0, priority: "background" }), groupListings(unrelated(120), { threshold: 0, priority: "background" })];
    expect(groupingPoolStats()).toMatchObject({ running: 1, runningBackground: 1, queued: 1 });

    const shopper = groupListings(realistic(), { threshold: 0 }); // interactive by default
    expect(groupingPoolStats()).toMatchObject({ running: 2, runningBackground: 1 });
    await Promise.all([shopper, ...warmups]);
  }, 60000);

  it("treats the deals feed as background work too", async () => {
    await closeGroupingPool();
    getGroupingPool().warm();
    await groupListings(realistic(), { threshold: 0 });

    const deals = [computeDealsOffThread(unrelated(100), { now: NOW }), computeDealsOffThread(unrelated(100), { now: NOW })];
    expect(groupingPoolStats()).toMatchObject({ running: 1, runningBackground: 1, queued: 1 });
    await Promise.all(deals);
  }, 60000);
});
