// The rate limiters, exercised through the real app. Kept in its own file because
// the limiters hold per-process counters: sharing a file with other tests that call
// the same endpoints would make the counts depend on test order.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../src/services/scraper.service.js", () => ({
  fetchAndRefreshListings: vi.fn(async () => ({ scraped: false })),
}));

import { createApp } from "../src/createApp.js";

let server;
let url;

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const call = (path, init) => fetch(`${url}${path}`, init);

describe("rate limits", () => {
  it("stops creating alerts after 10 attempts per address in the window, with the standard error body", async () => {
    const post = () => call("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });

    for (let i = 0; i < 10; i++) expect((await post()).status).toBe(400); // counted even though invalid

    const limited = await post();
    const body = await limited.json();
    expect(limited.status).toBe(429);
    expect(body).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(body.requestId).toBe(limited.headers.get("x-request-id"));
    expect(limited.headers.get("ratelimit-limit")).toBe("10");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0); // tells a well-behaved client when to retry
  });

  it("limits searches per address, because each one can trigger live scraping", async () => {
    // 120 allowed; a missing q is answered 400 but still counts against the limit.
    let last;
    for (let i = 0; i < 121; i++) last = await call("/api/listings/search");
    expect(last.status).toBe(429);
    expect((await last.json()).code).toBe("RATE_LIMITED");
  });

  it("does not limit the health check", async () => {
    for (let i = 0; i < 30; i++) expect((await call("/api/health")).status).not.toBe(429);
  });
});
