import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";

import { requireAdminKey, hasAdminKey } from "../src/middleware/adminKey.middleware.js";
import { createSearchLimiter } from "../src/middleware/rateLimit.middleware.js";

// A tiny real Express app, so the middleware runs exactly as it does in the API.
function startApp(configure) {
  const app = express();
  configure(app);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

describe("requireAdminKey", () => {
  let server;
  let url;
  const original = process.env.ADMIN_API_KEY;

  beforeAll(async () => {
    ({ server, url } = await startApp((app) => {
      app.post("/protected", requireAdminKey, (req, res) => res.json({ ok: true }));
      app.get("/whoami", (req, res) => res.json({ admin: hasAdminKey(req) }));
    }));
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = original;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("is switched off, not open, when no key is configured", async () => {
    delete process.env.ADMIN_API_KEY;
    const res = await fetch(`${url}/protected`, { method: "POST", headers: { "x-admin-key": "anything" } });
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
  });

  it("rejects a missing key", async () => {
    process.env.ADMIN_API_KEY = "s3cret-test-key";
    const res = await fetch(`${url}/protected`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong key, including one that is a prefix of the real key", async () => {
    process.env.ADMIN_API_KEY = "s3cret-test-key";
    for (const wrong of ["nope", "s3cret-test", "s3cret-test-key-extra", ""]) {
      const res = await fetch(`${url}/protected`, { method: "POST", headers: { "x-admin-key": wrong } });
      expect(res.status).toBe(401);
    }
  });

  it("accepts the right key", async () => {
    process.env.ADMIN_API_KEY = "s3cret-test-key";
    const res = await fetch(`${url}/protected`, { method: "POST", headers: { "x-admin-key": "s3cret-test-key" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("hasAdminKey reports true only for the right key, and false when nothing is configured", async () => {
    process.env.ADMIN_API_KEY = "s3cret-test-key";
    const yes = await fetch(`${url}/whoami`, { headers: { "x-admin-key": "s3cret-test-key" } }).then((r) => r.json());
    const no = await fetch(`${url}/whoami`, { headers: { "x-admin-key": "wrong" } }).then((r) => r.json());
    const none = await fetch(`${url}/whoami`).then((r) => r.json());
    expect([yes.admin, no.admin, none.admin]).toEqual([true, false, false]);

    delete process.env.ADMIN_API_KEY;
    const unconfigured = await fetch(`${url}/whoami`, { headers: { "x-admin-key": "s3cret-test-key" } }).then((r) => r.json());
    expect(unconfigured.admin).toBe(false);
  });
});

describe("search limiter", () => {
  let server;
  let url;

  beforeAll(async () => {
    ({ server, url } = await startApp((app) => {
      app.get("/search", createSearchLimiter({ limit: 3 }), (req, res) => res.json({ ok: true }));
    }));
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("allows requests up to the limit, then answers 429 in the API's error shape", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await fetch(`${url}/search`)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);

    const blocked = await (await fetch(`${url}/search`)).json();
    expect(blocked.success).toBe(false);
    expect(blocked.message).toMatch(/too many searches/i);
  });
});
