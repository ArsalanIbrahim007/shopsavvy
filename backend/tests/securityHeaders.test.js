import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { createApp } from "../src/createApp.js";

// The standard security headers, through the REAL app (createApp): what a response actually carries, not what a config file says.

let server;
let url;
beforeAll(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, () => {
      url = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const get = (path, headers = {}) => fetch(`${url}${path}`, { headers });

describe("API responses", () => {
  it("cannot load or run anything, cannot be framed, and tell the browser not to guess the type", async () => {
    const res = await get("/api/health");
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|script-src/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("allows https only for a year, and does not advertise the framework", async () => {
    const res = await get("/api/health");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d{7,}/);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("lets the frontend on another origin use the response (the origin allow-list is config/cors.js)", async () => {
    const res = await get("/api/health", { Origin: "http://localhost:5173" });
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("carries the same headers on an error answer, a missing page and a bad request", async () => {
    for (const path of ["/api/nothing-here", "/api/listings/not-an-id"]) {
      const res = await get(path);
      expect(res.status, path).toBeGreaterThanOrEqual(400);
      expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(res.headers.get("content-security-policy"), path).toContain("default-src 'none'");
    }
  });
});

describe("the Swagger page", () => {
  it("is served, with the standard headers but without the strict content policy it could not run under", async () => {
    const res = await get("/api-docs/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).not.toBeNull();
  });

  it("serves the spec as JSON under the strict policy (only the page itself is relaxed)", async () => {
    const res = await get("/api-docs-json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});

describe("the alert confirm and cancel pages", () => {
  it("keep their own, nonce-based policy, which replaces the API default", async () => {
    for (const page of ["/alerts/confirm", "/alerts/cancel"]) {
      const res = await get(`${page}?token=abc`);
      const csp = res.headers.get("content-security-policy");
      expect(csp, page).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
      expect(csp, page).toMatch(/style-src 'nonce-/);
      expect(csp, page).toContain("frame-ancestors 'none'");
      expect(csp, page).not.toMatch(/unsafe-inline/);
      expect(res.headers.get("x-content-type-options"), page).toBe("nosniff");
    }
  });
});
