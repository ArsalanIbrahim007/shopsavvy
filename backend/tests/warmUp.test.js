import { describe, it, expect } from "vitest";

import { warmUp, warmUpPaths } from "../src/scripts/ops/warm-up.js";
import { DEAL_CATEGORIES } from "../src/services/dealsFeed.service.js";

const answer = (status = 200) => ({ ok: status === 200, status, arrayBuffer: async () => new ArrayBuffer(0) });

describe("warmUpPaths", () => {
  it("groups every category in full, past the saved first page", () => {
    const paths = warmUpPaths();
    for (const category of DEAL_CATEGORIES) {
      expect(paths).toContain(`/api/listings/catalog?category=${category}&offset=60&limit=1`);
    }
    expect(paths).toContain("/api/listings/deals?limit=8");
    expect(paths).toContain("/api/integrity");
  });
});

describe("warmUp", () => {
  it("waits for the health check, then opens each page once, in order", async () => {
    const asked = [];
    let healthCalls = 0;
    const fetchImpl = async (url) => {
      asked.push(url);
      if (url.endsWith("/api/health")) {
        healthCalls += 1;
        if (healthCalls < 3) throw new Error("ECONNREFUSED");
      }
      return answer();
    };
    const { ok, results } = await warmUp({ base: "http://x/", paths: ["/a", "/b"], fetchImpl, log: () => {}, pollMs: 0 });
    expect(ok).toBe(true);
    expect(asked).toEqual(["http://x/api/health", "http://x/api/health", "http://x/api/health", "http://x/a", "http://x/b"]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
  });

  it("reports a failing page and still opens the rest", async () => {
    const fetchImpl = async (url) => (url.endsWith("/a") ? answer(503) : answer());
    const { ok, results } = await warmUp({ base: "http://x", paths: ["/a", "/b"], fetchImpl, log: () => {}, pollMs: 0 });
    expect(ok).toBe(false);
    expect(results.map((r) => r.status)).toEqual([503, 200]);
  });

  it("gives up when the API never answers", async () => {
    let t = 0;
    const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
    const { ok, results } = await warmUp({ base: "http://x", paths: ["/a"], fetchImpl, log: () => {}, pollMs: 0, healthWaitMs: 5, now: () => (t += 10) });
    expect(ok).toBe(false);
    expect(results).toEqual([]);
  });
});
