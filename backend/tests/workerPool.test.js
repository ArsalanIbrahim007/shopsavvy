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
    const started = Date.now();
    await Promise.all([pool.run("sleep", { ms: 300 }), pool.run("sleep", { ms: 300 })]);
    expect(Date.now() - started).toBeLessThan(560); // two at once, not one after the other

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
