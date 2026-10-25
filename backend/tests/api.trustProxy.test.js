// TRUST_PROXY: which address the rate limits count by. In its own file because the limiters hold per-process counters, and these
// tests use them up on purpose.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../src/services/scraper.service.js", () => ({
  fetchAndRefreshListings: vi.fn(async () => ({ scraped: false })),
}));

import { resolveTrustProxy, describeTrustProxy } from "../src/config/proxy.js";
import { createApp } from "../src/createApp.js";

describe("resolveTrustProxy", () => {
  it("trusts nothing when not set, and a number of hops when given one", () => {
    expect(resolveTrustProxy({})).toEqual({ value: false, ignored: null });
    expect(resolveTrustProxy({ TRUST_PROXY: " " })).toEqual({ value: false, ignored: null });
    expect(resolveTrustProxy({ TRUST_PROXY: "false" })).toEqual({ value: false, ignored: null });
    expect(resolveTrustProxy({ TRUST_PROXY: "0" })).toEqual({ value: false, ignored: null });
    expect(resolveTrustProxy({ TRUST_PROXY: "1" })).toEqual({ value: 1, ignored: null });
    expect(resolveTrustProxy({ TRUST_PROXY: "2" })).toEqual({ value: 2, ignored: null });
  });

  it("takes proxy addresses, subnets and the named private ranges", () => {
    expect(resolveTrustProxy({ TRUST_PROXY: "10.0.0.0/8, 192.168.1.5,Loopback" }).value).toBe("10.0.0.0/8,192.168.1.5,loopback");
    expect(resolveTrustProxy({ TRUST_PROXY: "fd00::/8" }).value).toBe("fd00::/8");
  });

  it("refuses 'true' (every client could pick its own address), and anything it cannot read, with a warning", () => {
    for (const bad of ["true", "yes", "11", "10.0.0.0/33", "10.0.0.1/8/1", "loopback,example.com"]) {
      expect(resolveTrustProxy({ TRUST_PROXY: bad }), bad).toEqual({ value: false, ignored: bad });
    }
    expect(describeTrustProxy({ TRUST_PROXY: "true" }).join("\n")).toMatch(/Ignoring TRUST_PROXY="true"/);
    expect(describeTrustProxy({}).join("\n")).toMatch(/set TRUST_PROXY=1/);
    expect(describeTrustProxy({ TRUST_PROXY: "1" }).join("\n")).toMatch(/1 proxy hop$/);
  });
});

// The alert-creation limiter allows 10 requests per address in 15 minutes; an empty body is answered 400 but still counted.
async function withServer(env, run) {
  let server;
  const url = await new Promise((resolve) => {
    server = createApp(env).listen(0, () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
  try {
    await run((forwardedFor) => fetch(`${url}/api/alerts`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwardedFor }, body: "{}",
    }).then((res) => res.status));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("rate limits behind a proxy", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {}); // express-rate-limit warns about the unexpected header once
  });
  afterAll(() => vi.restoreAllMocks());

  it("without TRUST_PROXY, ignores X-Forwarded-For: a script cannot escape the limit by inventing addresses", async () => {
    await withServer({}, async (post) => {
      for (let i = 0; i < 10; i++) expect(await post(`203.0.113.${i}`)).toBe(400);
      expect(await post("203.0.113.99")).toBe(429); // a new made-up address, still the same caller
    });
  });

  it("with TRUST_PROXY=1, counts each visitor the proxy names separately", async () => {
    await withServer({ TRUST_PROXY: "1" }, async (post) => {
      for (let i = 0; i < 10; i++) expect(await post("198.51.100.7")).toBe(400);
      expect(await post("198.51.100.7")).toBe(429);
      expect(await post("198.51.100.8")).toBe(400); // another visitor behind the same proxy is not locked out
    });
  });

  it("with TRUST_PROXY=1, believes only the hop the proxy added, not addresses the client put before it", async () => {
    await withServer({ TRUST_PROXY: "1" }, async (post) => {
      for (let i = 0; i < 10; i++) expect(await post(`192.0.2.${i}, 198.51.100.20`)).toBe(400);
      expect(await post("192.0.2.200, 198.51.100.20")).toBe(429);
    });
  });
});
