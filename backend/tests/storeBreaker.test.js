import { describe, it, expect, vi, beforeEach } from "vitest";

import { createStoreBreaker, FAILURES_TO_OPEN, PAUSES_MS } from "../src/scrapers/storeBreaker.js";

const MIN = 60_000;
let clock;
let log;
const make = (options = {}) => createStoreBreaker({ now: () => clock, log, ...options });
const failTimes = (breaker, platform, n) => { for (let i = 0; i < n; i++) breaker.failure(platform); };

beforeEach(() => { clock = 1_000_000; log = vi.fn(); });

describe("createStoreBreaker", () => {
  it("uses 5 failures in a row and pauses of 5, 15 and 30 minutes", () => {
    expect(FAILURES_TO_OPEN).toBe(5);
    expect(PAUSES_MS).toEqual([5 * MIN, 15 * MIN, 30 * MIN]);
  });

  it("asks a store as usual until it fails five times in a row", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 4);
    expect(breaker.allow("telemart")).toBe(true);
    breaker.failure("telemart");
    expect(breaker.allow("telemart")).toBe(false);
    expect(log).toHaveBeenCalledWith("[breaker] telemart: 5 failures in a row, paused for 5 min");
  });

  it("counts failures IN A ROW: a success in between starts the count again", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 4);
    breaker.success("telemart");
    failTimes(breaker, "telemart", 4);
    expect(breaker.allow("telemart")).toBe(true);
    breaker.failure("telemart");
    expect(breaker.allow("telemart")).toBe(false);
  });

  it("keeps stores apart: one store's trouble does not pause another", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 5);
    expect(breaker.allow("telemart")).toBe(false);
    expect(breaker.allow("mega")).toBe(true);
    failTimes(breaker, "paklap", 4);
    expect(breaker.allow("paklap")).toBe(true);
  });

  it("stays paused until the pause is over, then lets exactly one request through as a probe", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 5);
    clock += 5 * MIN - 1;
    expect(breaker.allow("telemart")).toBe(false); // one millisecond early
    clock += 1;
    expect(breaker.allow("telemart")).toBe(true); // the probe
    expect(breaker.allow("telemart")).toBe(false); // everyone else still skips it while the probe is out
    expect(breaker.allow("telemart")).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("telemart: trying it again"));
  });

  it("closes when the probe succeeds: asked as usual, and needs five new failures to pause again", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 5);
    clock += 5 * MIN;
    expect(breaker.allow("telemart")).toBe(true);
    breaker.success("telemart");
    expect(log).toHaveBeenCalledWith("[breaker] telemart: answering again");
    expect(breaker.allow("telemart")).toBe(true);
    expect(breaker.allow("telemart")).toBe(true);
    failTimes(breaker, "telemart", 4);
    expect(breaker.allow("telemart")).toBe(true);
    expect(breaker.paused()).toEqual([]);
  });

  it("pauses again, for longer, when the probe fails: 5, then 15, then 30 minutes, and 30 from then on", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 5);
    const pauses = [];
    for (let round = 0; round < 5; round++) {
      const before = breaker.paused()[0].until;
      pauses.push((before - clock) / MIN);
      clock = before;
      expect(breaker.allow("telemart")).toBe(true); // probe
      breaker.failure("telemart");
    }
    pauses.push((breaker.paused()[0].until - clock) / MIN);
    expect(pauses).toEqual([5, 15, 30, 30, 30, 30]);
  });

  it("asks a store that stays down about 11 times in a 2.5-hour run of one search every 17 seconds, not about 530", () => {
    const breaker = make();
    let asked = 0;
    const runEnd = clock + 150 * MIN;
    while (clock < runEnd) {
      if (breaker.allow("telemart")) { asked += 1; breaker.failure("telemart"); }
      clock += 17_000;
    }
    expect(asked).toBeGreaterThanOrEqual(10);
    expect(asked).toBeLessThanOrEqual(12);
  });

  it("does not treat a store that answers but finds nothing as a problem (only errors are reported as failures)", () => {
    const breaker = make();
    for (let i = 0; i < 50; i++) { expect(breaker.allow("w11stop")).toBe(true); breaker.success("w11stop"); }
    expect(breaker.paused()).toEqual([]);
  });

  it("reports which stores are paused and until when, and forgets everything on reset", () => {
    const breaker = make();
    failTimes(breaker, "telemart", 5);
    failTimes(breaker, "paklap", 2);
    expect(breaker.paused()).toEqual([{ platform: "telemart", failures: 5, until: clock + 5 * MIN }]);
    breaker.reset();
    expect(breaker.paused()).toEqual([]);
    expect(breaker.allow("telemart")).toBe(true);
  });

  it("accepts other thresholds and pauses", () => {
    const breaker = make({ failuresToOpen: 2, pausesMs: [MIN] });
    failTimes(breaker, "x", 2);
    expect(breaker.allow("x")).toBe(false);
    clock += MIN;
    expect(breaker.allow("x")).toBe(true);
  });
});
