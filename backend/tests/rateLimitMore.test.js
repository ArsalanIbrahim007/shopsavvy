// The rate limits added on 2026-10-03 for the endpoints that had none (CodeQL: "missing rate limiting"). In its own file for the same
// reason as api.rateLimit.test.js: the limiters count per process, so sharing a file would make the counts depend on test order.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";

let server;
let url;

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // the list and stats endpoints read the database: answer them without one
  vi.spyOn(Listing, "find").mockImplementation(() => {
    const q = { sort: () => q, skip: () => q, limit: () => q, lean: () => q, select: () => q, then: (resolve) => Promise.resolve([]).then(resolve) };
    return q;
  });
  vi.spyOn(Listing, "countDocuments").mockResolvedValue(0);
  vi.spyOn(Listing, "distinct").mockResolvedValue([]);
  vi.spyOn(Listing, "aggregate").mockResolvedValue([]);
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const call = (path, init) => fetch(`${url}${path}`, init);
const BAD_ID = "/api/listings/not-an-id"; // answered 400 before any database work, and counted

describe("the product page endpoint", () => {
  it("is limited to 200 requests per window per address, with the standard error body", async () => {
    let last;
    for (let i = 0; i < 200; i++) {
      last = await call(BAD_ID);
      expect(last.status).toBe(400);
    }
    expect(last.headers.get("ratelimit-limit")).toBe("200");
    expect(last.headers.get("ratelimit-remaining")).toBe("0");

    const limited = await call(BAD_ID);
    const body = await limited.json();
    expect(limited.status).toBe(429);
    expect(body).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("the endpoints that write with the admin key", () => {
  it("allow only 30 attempts per window, so the key cannot be guessed by trying", async () => {
    const attempt = () => call("/api/listings/not-an-id/history", {
      method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": "guess" }, body: JSON.stringify({ price: 1 }),
    });
    for (let i = 0; i < 30; i++) {
      const res = await attempt();
      expect([401, 503]).toContain(res.status); // refused (wrong key, or none configured), and counted
    }
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("RATE_LIMITED");
    expect(limited.headers.get("ratelimit-limit")).toBe("30");
  });
});

describe("the read endpoints", () => {
  it("one product's price history is limited to 240 per window", async () => {
    const first = await call("/api/listings/not-an-id/history");
    expect(first.headers.get("ratelimit-limit")).toBe("240");
    expect(first.headers.get("ratelimit-remaining")).toBe("239");
  });

  it("the stored-listings list and the headline counts are limited to 240 per window", async () => {
    for (const path of ["/api/listings", "/api/listings/stats"]) {
      const res = await call(path);
      expect(res.headers.get("ratelimit-limit"), path).toBe("240");
      expect(Number(res.headers.get("ratelimit-remaining")), path).toBeLessThan(240);
    }
  });
});

describe("the health check", () => {
  it("is limited generously (600 per window): a monitor can poll it, a script cannot hammer the database ping", async () => {
    const first = await call("/api/health");
    expect(first.headers.get("ratelimit-limit")).toBe("600");
    for (let i = 0; i < 598; i++) await call("/api/health");
    const last = await call("/api/health");
    expect(last.headers.get("ratelimit-remaining")).toBe("0");
    expect(last.status).not.toBe(429);
    const limited = await call("/api/health");
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("RATE_LIMITED");
  }, 60000);
});
