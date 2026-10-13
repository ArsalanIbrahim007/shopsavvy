import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The default query log file for runs that build their own list: kept out of the real backend folder.
const { defaultLog } = vi.hoisted(() => {
  const file = `${process.env.TEMP || "/tmp"}/shopsavvy-test-query-log-${process.pid}.json`;
  process.env.SCRAPE_QUERY_LOG_FILE = file;
  return { defaultLog: file };
});

vi.mock("../src/services/scraper.service.js", () => ({ runScrapersAndSave: vi.fn() }));

import { runScrapersAndSave } from "../src/services/scraper.service.js";
import { groupListings, getGroupingPool, closeGroupingPool } from "../src/services/grouping.service.js";
import Listing from "../src/models/listing.model.js";
import { createQueryLog, deriveQuery, RUN_BUDGET_MS, runScheduledScrape } from "../src/services/scheduledScraping.service.js";

// A fake clock the stubbed scraper moves forward, so no test waits for real time.
let clock;
const now = () => clock;
const queries = ["a", "b", "c", "d", "e"];

beforeEach(() => {
  clock = 1_000_000;
  vi.mocked(runScrapersAndSave).mockReset().mockImplementation(async () => { clock += 60_000; return 10; }); // each query takes one minute
});

describe("runScheduledScrape time budget", () => {
  it("allows a bit under 3 hours, because Task Scheduler stops the task at 3 and the page check follows", () => {
    expect(RUN_BUDGET_MS).toBe(150 * 60 * 1000);
    expect(RUN_BUDGET_MS).toBeLessThan(3 * 3600 * 1000 - 15 * 60 * 1000);
  });

  it("runs every query when they fit in the budget, and reports nothing skipped", async () => {
    const progress = vi.fn();
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 10 * 60_000, now, onProgress: progress });
    expect(runScrapersAndSave.mock.calls.map((c) => c[0])).toEqual(queries);
    expect(summary).toMatchObject({ totalQueries: 5, totalSaved: 50, skipped: 0, failures: [] });
    expect(progress.mock.calls.some(([info]) => info.budgetReached)).toBe(false);
  });

  it("stops starting new queries once the budget has passed, in order, and says how many were left", async () => {
    const progress = vi.fn();
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 150_000, now, onProgress: progress }); // 2.5 minutes: a, b, c start
    expect(runScrapersAndSave.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]); // c starts at 2:00, finishes at 3:00; d would start at 3:00
    expect(summary).toMatchObject({ totalQueries: 5, totalSaved: 30, skipped: 2 });
    expect(progress).toHaveBeenLastCalledWith({ index: 3, total: 5, budgetReached: true, skipped: 2 });
  });

  it("starts nothing more at the moment the budget is used up", async () => {
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 120_000, now }); // at 2:00 the budget is used up
    expect(runScrapersAndSave.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(summary.skipped).toBe(3);
  });

  it("with a budget of nothing runs nothing, the first query included", async () => {
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 0, now });
    expect(runScrapersAndSave).toHaveBeenCalledTimes(0); // zero budget means zero: the check comes before every query, the first included
    expect(summary.skipped).toBe(5);
  });

  it("counts a failed query as run, keeps going, and still honours the budget", async () => {
    vi.mocked(runScrapersAndSave).mockReset().mockImplementation(async (query) => { clock += 60_000; if (query === "a") throw new Error("boom"); return 1; });
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 150_000, now });
    expect(summary.failures).toEqual([{ query: "a", error: "boom" }]);
    expect(summary).toMatchObject({ totalSaved: 2, skipped: 2 });
  });

  it("an empty list runs nothing and skips nothing", async () => {
    expect(await runScheduledScrape({ queries: [], delayMs: 0, now })).toMatchObject({ totalQueries: 0, skipped: 0 });
  });
});

describe("the query log (which queries were run, and when)", () => {
  let dir;
  let file;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "query-log-")); file = join(dir, "log.json"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("records every query it ran, failed ones too, and saves them for the next run", async () => {
    vi.mocked(runScrapersAndSave).mockReset().mockImplementation(async (query) => { clock += 60_000; if (query === "b") throw new Error("boom"); return 1; });
    const queryLog = createQueryLog({ file, now });
    await runScheduledScrape({ queries: ["a", "b", "c"], delayMs: 0, now, queryLog });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ a: 1_060_000, b: 1_120_000, c: 1_180_000 });
    expect(createQueryLog({ file, now }).lastQueried.get("b")).toBe(1_120_000); // read back by the next night's run
  });

  it("does not record the queries a budget stop left out, so they come first next time", async () => {
    const queryLog = createQueryLog({ file, now });
    const summary = await runScheduledScrape({ queries, delayMs: 0, budgetMs: 150_000, now, queryLog });
    expect(summary.skipped).toBe(2);
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")))).toEqual(["a", "b", "c"]); // d and e were never started
  });

  it("saves as it goes (every 20 queries), so a run that is killed keeps nearly all of it", async () => {
    const many = Array.from({ length: 25 }, (_, i) => `q${i}`);
    let onDiskDuringQ22 = null;
    vi.mocked(runScrapersAndSave).mockReset().mockImplementation(async (query) => {
      if (query === "q22") onDiskDuringQ22 = Object.keys(JSON.parse(readFileSync(file, "utf8"))).length; // saved after the 20th, not yet the 25th
      clock += 1000;
      return 1;
    });
    await runScheduledScrape({ queries: many, delayMs: 0, budgetMs: 1e9, now, queryLog: createQueryLog({ file, now }) });
    expect(onDiskDuringQ22).toBe(20);
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")))).toHaveLength(25);
  });

  it("starts empty when there is no file, or one that is damaged, or has nonsense in it", () => {
    expect(createQueryLog({ file, now }).lastQueried.size).toBe(0);
    for (const content of ["", "{not json", "[1,2]", "null", '"text"', '{"a":"yesterday","b":null,"c":1000000}']) {
      writeFileSync(file, content);
      const log = createQueryLog({ file, now });
      expect([...log.lastQueried.keys()].filter((q) => q !== "c")).toEqual([]);
    }
  });

  it("forgets queries not run for 60 days, and keeps the others", () => {
    const day = 86_400_000;
    writeFileSync(file, JSON.stringify({ old: clock - 61 * day, edge: clock - 59 * day, recent: clock - day }));
    expect([...createQueryLog({ file, now }).lastQueried.keys()].sort()).toEqual(["edge", "recent"]);
  });

  it("a run given no queries builds its own list, ordered by the default log, and keeps that log up to date", async () => {
    rmSync(defaultLog, { force: true });
    const listing = (id, platform, days) => ({ _id: `6a78a2af9c96f297ede77${id}`, platform, title: "Dell Pro 15 Essential PV15250 Laptop", normalizedTitle: "x", price: 90000 + Number(id), productCategory: "laptop", inStock: true, lastScrapedAt: new Date(clock - days * 86_400_000) });
    vi.spyOn(Listing, "find").mockReturnValue({ lean: async () => [listing("001", "paklap", 1), listing("002", "mega", 2)] });
    const summary = await runScheduledScrape({ delayMs: 0, now });
    expect(summary).toMatchObject({ totalQueries: 1, totalSaved: 10, skipped: 0 });
    expect(Object.keys(JSON.parse(readFileSync(defaultLog, "utf8")))).toEqual([deriveQuery("Dell Pro 15 Essential PV15250 Laptop")]);
    rmSync(defaultLog, { force: true });
    vi.restoreAllMocks();
  });

  it("does not stop a run when the log cannot be saved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const summary = await runScheduledScrape({ queries: ["a"], delayMs: 0, now, queryLog: createQueryLog({ file: join(dir, "no-such-folder", "log.json"), now }) });
    expect(summary.totalSaved).toBe(10);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not save the query log"), expect.any(String));
    warn.mockRestore();
  });
});

describe("groupListings time limit", () => {
  it("passes a job's own limit to the pool, and leaves the pool's default when none is given", async () => {
    const run = vi.spyOn(getGroupingPool(), "run").mockResolvedValue([]);
    const listings = Array.from({ length: 50 }, (_, i) => ({ _id: `id${i}`, platform: "mega", title: `Phone ${i}`, price: 1000 + i, productCategory: "smartphone" }));
    await groupListings(listings, { strategy: "rule", recommend: false, priority: "background", timeoutMs: 600_000 });
    expect(run.mock.calls[0][2]).toEqual({ priority: "background", timeoutMs: 600_000 });
    await groupListings(listings, { strategy: "rule", recommend: false });
    expect(run.mock.calls[1][2].timeoutMs).toBeUndefined(); // the pool then uses its own 90 s
    run.mockRestore();
    await closeGroupingPool();
  });
});
