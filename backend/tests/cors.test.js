import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { normalizeOrigin, resolveCorsPolicy, isAllowedOrigin, describeCorsPolicy } from "../src/config/cors.js";
import { createApp } from "../src/createApp.js";

const allowedBy = (env, origin) => isAllowedOrigin(origin, resolveCorsPolicy(env));

describe("normalizeOrigin", () => {
  it("reduces a URL to scheme, host and port, and rejects anything that is not http(s)", () => {
    expect(normalizeOrigin("https://Shop.Example.com/")).toBe("https://shop.example.com");
    expect(normalizeOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(normalizeOrigin("https://x.com:443")).toBe("https://x.com"); // default port dropped
    for (const bad of ["null", "", "file:///etc/passwd", "ftp://x.com", "not a url", undefined]) {
      expect(normalizeOrigin(bad), String(bad)).toBeNull();
    }
  });
});

describe("resolveCorsPolicy", () => {
  it("defaults to loopback pages only when CORS_ORIGINS is not set (or blank)", () => {
    expect(resolveCorsPolicy({})).toMatchObject({ loopbackOnly: true });
    expect(resolveCorsPolicy({ CORS_ORIGINS: "  ,  " })).toMatchObject({ loopbackOnly: true });
  });

  it("reads a comma separated list, tolerating spaces, case and a trailing slash", () => {
    const policy = resolveCorsPolicy({ CORS_ORIGINS: " https://Shop.example.com/ , https://www.shop.example.com,http://localhost:8080" });
    expect(policy.loopbackOnly).toBe(false);
    expect([...policy.origins].sort()).toEqual(["http://localhost:8080", "https://shop.example.com", "https://www.shop.example.com"]);
    expect(policy.ignored).toEqual([]);
  });

  it("ignores a wildcard, an entry with a path, a non-http scheme and garbage, and says so", () => {
    const env = { CORS_ORIGINS: "*,https://a.example.com/app,ftp://b.example.com,nonsense,https://ok.example.com" };
    const policy = resolveCorsPolicy(env);
    expect([...policy.origins]).toEqual(["https://ok.example.com"]);
    expect(policy.ignored).toEqual(["*", "https://a.example.com/app", "ftp://b.example.com", "nonsense"]);
    expect(describeCorsPolicy(env).join("\n")).toMatch(/Ignoring CORS_ORIGINS entry "\*"/);
  });

  it("allows nobody, not everybody, when the list holds no valid origin", () => {
    const env = { CORS_ORIGINS: "*" };
    expect(resolveCorsPolicy(env)).toMatchObject({ loopbackOnly: false });
    expect(allowedBy(env, "http://localhost:5173")).toBe(false);
    expect(allowedBy(env, "https://anything.example.com")).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("with no list, allows loopback pages on any port and nothing else", () => {
    for (const origin of ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:3000", "http://[::1]:5173", "https://localhost"]) {
      expect(allowedBy({}, origin), origin).toBe(true);
    }
    const attacks = [
      "http://evil.com",
      "http://localhost.evil.com",
      "http://localhost:5173.evil.com",
      "http://127.0.0.1.evil.com",
      "http://localhost@evil.com",
      "http://evillocalhost:5173", // ends with "localhost" but is another host
      "http://notlocalhost",
      "http://1127.0.0.1:5173",
      "http://0.0.0.0:5173",
      "http://192.168.1.20:5173",
      "null",
      "file://",
      "",
    ];
    for (const origin of attacks) expect(allowedBy({}, origin), origin).toBe(false);
  });

  it("with a list, allows exactly those origins: same scheme, host and port", () => {
    const env = { CORS_ORIGINS: "https://shop.example.com,http://localhost:5173" };
    expect(allowedBy(env, "https://shop.example.com")).toBe(true);
    expect(allowedBy(env, "http://localhost:5173")).toBe(true);

    for (const origin of [
      "http://shop.example.com", // other scheme
      "https://shop.example.com:8443", // other port
      "https://www.shop.example.com", // subdomain
      "https://shop.example.com.evil.com",
      "https://evilshop.example.com",
      "http://localhost:5174", // loopback is NOT implied once a list is given
      "http://127.0.0.1:5173",
    ]) {
      expect(allowedBy(env, origin), origin).toBe(false);
    }
  });

  it("rejects a request without an Origin header (there is nothing to allow)", () => {
    expect(allowedBy({}, undefined)).toBe(false);
  });
});

describe("the running app", () => {
  let server;
  let url;
  const saved = process.env.CORS_ORIGINS;

  const start = async (corsOrigins) => {
    if (corsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = corsOrigins;
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  };

  const get = (origin, path = "/api/listings/suggest?q=a") => fetch(`${url}${path}`, { headers: origin ? { Origin: origin } : {} });
  const preflight = (origin, method = "POST", headers = "content-type") =>
    fetch(`${url}/api/alerts`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers },
    });

  beforeEach(() => { server = null; });
  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (saved === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = saved;
  });

  it("lets an allowed website read the response, and expose the request id and retry headers", async () => {
    await start("https://shop.example.com");
    const res = await get("https://shop.example.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
    expect(res.headers.get("vary")).toMatch(/Origin/i);
    const exposed = res.headers.get("access-control-expose-headers").toLowerCase();
    expect(exposed).toContain("x-request-id");
    expect(exposed).toContain("retry-after");
  });

  it("gives another website no permission (the request is still served; the browser withholds it)", async () => {
    await start("https://shop.example.com");
    for (const origin of ["https://evil.example.com", "http://localhost:5173", "null"]) {
      const res = await get(origin);
      expect(res.status, origin).toBe(200);
      expect(res.headers.get("access-control-allow-origin"), origin).toBeNull();
    }
  });

  it("answers a preflight from an allowed origin with only the methods and headers the API uses", async () => {
    await start("https://shop.example.com");
    const res = await preflight("https://shop.example.com", "DELETE", "content-type,x-admin-key");
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,DELETE,OPTIONS");
    expect(res.headers.get("access-control-allow-headers").toLowerCase()).toBe("content-type,x-admin-key,x-request-id");
    expect(res.headers.get("access-control-max-age")).toBe("600");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull(); // no cookies are used
  });

  it("answers a preflight from another origin without permission", async () => {
    await start("https://shop.example.com");
    const res = await preflight("https://evil.example.com");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("does not depend on CORS for requests without an Origin header", async () => {
    await start("https://shop.example.com");
    const res = await get(undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("with CORS_ORIGINS unset, allows local development pages and no one else", async () => {
    await start(undefined);
    expect((await get("http://localhost:5173")).headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect((await get("http://127.0.0.1:5174")).headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5174");
    expect((await get("https://evil.example.com")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await get("http://localhost.evil.com")).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("never answers with a wildcard, even if one is configured", async () => {
    await start("*");
    const res = await get("https://evil.example.com");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
