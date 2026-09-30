// Runs the REAL application (createApp: real middleware, routes, validators and
// error handler) with no database connected. That is exactly what proves the
// failure paths: what a caller sees when input is bad, when a route does not
// exist, and when the database is down.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../src/createApp.js";

let server;
let url;
const originalKey = process.env.ADMIN_API_KEY;

const json = (path, init) => fetch(`${url}${path}`, init).then(async (res) => ({ res, body: await res.json() }));
const postJson = (path, body, headers = {}) =>
  json(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  // Fail database commands quickly instead of waiting the default 10 s.
  mongoose.set("bufferTimeoutMS", 300);
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = originalKey;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe("health", () => {
  it("reports the database as down, with 503, when it cannot be reached", async () => {
    const { res, body } = await json("/api/health");
    expect(res.status).toBe(503);
    expect(body).toMatchObject({ status: "degraded", db: "down" });
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
  });
});

describe("unknown routes and bad ids", () => {
  it("answers an unknown route with a coded 404", async () => {
    const { res, body } = await json("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: "NOT_FOUND" });
  });

  it("answers an invalid listing id with 400 INVALID_ID, before touching the database", async () => {
    const { res, body } = await json("/api/listings/not-an-id");
    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_ID");
  });
});

describe("search input", () => {
  it("rejects a missing, non-text or over-long q with 400", async () => {
    for (const path of ["/api/listings/search", "/api/listings/search?q=", "/api/listings/search?q[]=x", `/api/listings/search?q=${"a".repeat(101)}`]) {
      const { res, body } = await json(path);
      expect(res.status, path).toBe(400);
      expect(body.code, path).toBe("BAD_REQUEST");
    }
  });
});

describe("request bodies", () => {
  it("answers malformed JSON with 400 INVALID_JSON, not a 500", async () => {
    const { res, body } = await json("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{ this is not json",
    });
    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_JSON");
  });

  it("answers an oversized body with 413", async () => {
    const { res, body } = await json("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pad: "x".repeat(200 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("answers invalid alert input with VALIDATION_ERROR and the field errors", async () => {
    const { res, body } = await postJson("/api/alerts", { listingId: "nope", email: "not-an-email", targetPrice: -5 });
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: "VALIDATION_ERROR", message: "Validation failed" });
    expect(body.errors.map((e) => e.path).sort()).toEqual(["email", "listingId", "targetPrice"]);
  });

  it("requires a well-formed token to confirm or cancel an alert, and an object in its place is rejected", async () => {
    for (const path of ["/api/alerts/confirm", "/api/alerts/cancel"]) {
      const missing = await postJson(path, {});
      expect(missing.res.status, path).toBe(400);
      expect(missing.body.code).toBe("VALIDATION_ERROR");
      const operator = await postJson(path, { token: { $ne: "x" } });
      expect(operator.res.status, path).toBe(400);
    }
  });

  it("no longer answers the old list and cancel-by-email endpoints", async () => {
    expect((await json("/api/alerts?email=a@b.co")).res.status).toBe(404);
    const cancel = await json("/api/alerts/6abaa344cdd20c9c0815d328", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co" }),
    });
    expect(cancel.res.status).toBe(404);
  });
});

describe("guarded endpoints", () => {
  it("are disabled (503, SERVICE_DISABLED) when no admin key is configured", async () => {
    delete process.env.ADMIN_API_KEY;
    const { res, body } = await postJson("/api/listings", { platform: "x", title: "Phone", price: 1 });
    expect(res.status).toBe(503);
    expect(body.code).toBe("SERVICE_DISABLED");
  });

  it("answer 401 UNAUTHORIZED for a wrong key", async () => {
    process.env.ADMIN_API_KEY = "test-key-123";
    const { res, body } = await postJson("/api/listings", { platform: "x", title: "Phone", price: 1 }, { "x-admin-key": "wrong" });
    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });
});

describe("when the database is down", () => {
  it("answers 503 DATABASE_UNAVAILABLE with a safe message, not a 500 and not the driver text", async () => {
    const { res, body } = await json("/api/analytics/overview");
    expect(res.status).toBe(503);
    expect(body.code).toBe("DATABASE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toMatch(/buffering|mongoose|listings\./i);
  });
});
