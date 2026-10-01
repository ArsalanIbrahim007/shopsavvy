import { describe, it, expect, afterEach } from "vitest";

import { WorkerPool } from "../src/workers/workerPool.js";
import { ERROR_CODES } from "../src/errors/AppError.js";

const script = new URL("./fixtures/testWorker.js", import.meta.url);

let pool;
const makePool = (options) => (pool = new WorkerPool(script, { name: "test worker", ...options }));

afterEach(async () => {
  await pool?.close();
  pool = null;
});

describe("WorkerPool", () => {
  it("runs a job on a worker and returns its result", async () => {
    makePool({ size: 1 });
    await expect(pool.run("echo", { a: [1, 2, { b: "c" }] })).resolves.toEqual({ a: [1, 2, { b: "c" }] });
  });

  it("reuses the same worker thread for later jobs", async () => {
    makePool({ size: 1 });
    const first = await pool.run("pid");
    const second = await pool.run("pid");
    expect(second).toBe(first);
  });

  it("rejects with the worker's message when the job throws, and keeps working afterwards", async () => {
    makePool({ size: 1 });
    await expect(pool.run("fail")).rejects.toThrow("deliberate failure");
    await expect(pool.run("echo", 5)).resolves.toBe(5);
  });

  it("rejects a job whose worker dies, then replaces the worker", async () => {
    makePool({ size: 1 });
    const before = await pool.run("pid");
    await expect(pool.run("crash")).rejects.toThrow(/crashed/);
    const after = await pool.run("pid");
    expect(after).not.toBe(before); // a fresh thread
  });

  it("terminates a job that runs too long and can still run the next one", async () => {
    makePool({ size: 1 });
    await expect(pool.run("sleep", { ms: 2000 }, { timeoutMs: 100 })).rejects.toThrow(/timed out/);
    await expect(pool.run("echo", "still alive")).resolves.toBe("still alive");
  });

  it("runs jobs in parallel up to its size, and queues the rest", async () => {
    makePool({ size: 2 });
    await pool.run("echo", 0); // start both workers first, so start-up time is not part of the comparison
    await Promise.all([pool.run("echo", 1), pool.run("echo", 2)]);

    // Two jobs at once overlap in time (checked from the times the jobs report, not from a stopwatch that a busy machine distorts).
    const [first, second] = await Promise.all([pool.run("span", { ms: 200 }), pool.run("span", { ms: 200 })]);
    expect(second.start).toBeLessThan(first.end);
    expect(first.start).toBeLessThan(second.end);

    const jobs = [pool.run("sleep", { ms: 50 }), pool.run("sleep", { ms: 50 }), pool.run("sleep", { ms: 50 })];
    expect(pool.stats()).toMatchObject({ running: 2, queued: 1 });
    await Promise.all(jobs);
    expect(pool.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it("refuses new work with a 503 SERVICE_BUSY once the waiting line is full", async () => {
    makePool({ size: 1, maxQueue: 1 });
    const running = pool.run("sleep", { ms: 200 });
    const queued = pool.run("echo", "queued");
    const refused = pool.run("echo", "too many");

    await expect(refused).rejects.toMatchObject({ statusCode: 503, code: ERROR_CODES.SERVICE_BUSY });
    await expect(running).resolves.toBe("slept");
    await expect(queued).resolves.toBe("queued"); // the ones already accepted still finish
  });

  it("rejects data a worker cannot receive instead of hanging", async () => {
    makePool({ size: 1 });
    await expect(pool.run("echo", { fn: () => 1 })).rejects.toThrow();
    await expect(pool.run("echo", 1)).resolves.toBe(1);
  });

  it("rejects work after it is closed", async () => {
    makePool({ size: 1 });
    await pool.close();
    await expect(pool.run("echo", 1)).rejects.toThrow(/closed/);
  });
});

describe("WorkerPool: interactive and background lanes", () => {
  const span = (priority, ms = 250) => pool.run("span", { ms }, { priority });
  const warmUp = async () => {
    await Promise.all([pool.run("echo", 1), pool.run("echo", 2)]); // start both workers, so start-up time is not part of what is measured
  };

  it("never lets background jobs take the last worker: one is always free for a shopper", async () => {
    makePool({ size: 2 });
    await warmUp();

    const b1 = span("background");
    const b2 = span("background");
    expect(pool.stats()).toMatchObject({ running: 1, runningBackground: 1, queued: 1 }); // the second background job waits although a worker is idle

    const interactive = span("interactive", 50);
    expect(pool.stats()).toMatchObject({ running: 2, runningBackground: 1, queued: 1 });

    const [first, second, shopper] = await Promise.all([b1, b2, interactive]);
    expect(shopper.start).toBeLessThan(first.end); // the shopper ran alongside the first background job...
    expect(shopper.end).toBeLessThanOrEqual(second.start + 5); // ...and finished before the second one got going
    expect(second.start).toBeGreaterThanOrEqual(first.end - 5); // background jobs ran one after the other
  });

  it("starts a waiting interactive job before a background job that has waited longer", async () => {
    makePool({ size: 2 });
    await warmUp();

    const a = span("interactive", 150);
    const b = span("interactive", 300);
    const background = span("background", 50); // queued first: both workers are busy
    const shopper = span("interactive", 50); // queued second, but a shopper
    expect(pool.stats()).toMatchObject({ running: 2, queued: 2 });

    const [, , bg, late] = await Promise.all([a, b, background, shopper]);
    expect(late.start).toBeLessThan(bg.start);
  });

  it("lets background work use the only worker when there is just one", async () => {
    makePool({ size: 1 });
    await expect(span("background", 20)).resolves.toMatchObject({ start: expect.any(Number) });
    expect(pool.backgroundLimit).toBe(1);
  });

  it("has a configurable background limit, and reserves all but one worker by default", () => {
    expect(makePool({ size: 4 }).backgroundLimit).toBe(3);
    expect(makePool({ size: 2 }).backgroundLimit).toBe(1);
    expect(makePool({ size: 4, backgroundLimit: 1 }).backgroundLimit).toBe(1);
  });

  it("bounds each lane's queue separately, so a flood of background work cannot turn shoppers away", async () => {
    makePool({ size: 1, maxQueue: 1 });
    await pool.run("echo", 0);
    const running = span("interactive", 200);
    const waitingBackground = span("background", 10);
    await expect(span("background", 10)).rejects.toMatchObject({ statusCode: 503, code: ERROR_CODES.SERVICE_BUSY }); // background lane is full
    const waitingShopper = span("interactive", 10); // the interactive lane still has room
    await expect(span("interactive", 10)).rejects.toMatchObject({ statusCode: 503 }); // and then it is full too
    await Promise.all([running, waitingBackground, waitingShopper]);
  });

  it("rejects a priority it does not know", async () => {
    makePool({ size: 1 });
    await expect(pool.run("echo", 1, { priority: "urgent" })).rejects.toThrow(/unknown priority/);
    await expect(pool.run("echo", 2)).resolves.toBe(2);
  });

  it("reports how many running jobs are background", async () => {
    makePool({ size: 2 });
    await warmUp();
    expect(pool.stats().runningBackground).toBe(0);
    const job = span("background", 100);
    expect(pool.stats().runningBackground).toBe(1);
    await job;
    expect(pool.stats()).toMatchObject({ running: 0, runningBackground: 0 });
  });

  it("still finishes everything: waiting background jobs run once the shoppers are served", async () => {
    makePool({ size: 2 });
    await warmUp();
    const results = await Promise.all([span("background", 30), span("background", 30), span("interactive", 30), span("background", 30), span("interactive", 30)]);
    expect(results).toHaveLength(5);
    expect(pool.stats()).toMatchObject({ running: 0, queued: 0 });
  });
});
