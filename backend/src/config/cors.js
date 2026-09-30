// cors.js — which websites' scripts may read this API's responses.
//
// CORS is enforced by the BROWSER, not by this server: a request from a disallowed
// origin still arrives and is still answered; the browser just refuses to hand the
// response to that page's script. So this is not access control (rate limits and the
// admin key are), it stops another site's page from using a visitor's browser to
// read the API on their behalf. Requests without an Origin header (curl, scripts,
// server-to-server, the Swagger page served by this app) are not affected.
//
// Policy
//  - CORS_ORIGINS set: exactly those origins, nothing else. Comma separated, each an
//    origin such as https://shopsavvy.example (scheme + host + optional port, no path).
//  - CORS_ORIGINS not set: only loopback addresses (localhost, 127.0.0.1, [::1]) on any
//    port, which is what local development with Vite needs. A deployment therefore has
//    to name its frontend, and forgetting to fails closed for every other website.
//  - No wildcard. "*" in CORS_ORIGINS is ignored with a warning.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** "https://Example.com/" -> "https://example.com"; null when it is not an http(s) origin. */
export function normalizeOrigin(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * @returns {{ origins: Set<string>, loopbackOnly: boolean, ignored: string[] }}
 */
export function resolveCorsPolicy(env = process.env) {
  const raw = String(env.CORS_ORIGINS ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (raw.length === 0) return { origins: new Set(), loopbackOnly: true, ignored: [] };

  const origins = new Set();
  const ignored = [];
  for (const entry of raw) {
    const origin = entry === "*" ? null : normalizeOrigin(entry);
    // A path, query or fragment means the entry is not an origin; do not guess what was meant.
    if (origin && entry.replace(/\/+$/, "").toLowerCase() === origin) origins.add(origin);
    else ignored.push(entry);
  }
  return { origins, loopbackOnly: false, ignored };
}

export function isLoopbackOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return LOOPBACK_HOSTS.has(new URL(normalized).hostname);
}

export function isAllowedOrigin(origin, policy) {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  // The browser sends the origin already normalised; anything that changes when
  // parsed ("http://localhost:5173.evil.com", trailing paths) is not one.
  if (!normalized || normalized !== origin) return false;
  return policy.loopbackOnly ? isLoopbackOrigin(normalized) : policy.origins.has(normalized);
}

/** Options for the `cors` middleware. */
export function buildCorsOptions(env = process.env) {
  const policy = resolveCorsPolicy(env);

  return {
    origin(origin, callback) {
      // No Origin header: not a browser cross-origin request, nothing to decide.
      if (!origin) return callback(null, false);
      // false = send no CORS headers, so the browser withholds the response from that page.
      return callback(null, isAllowedOrigin(origin, policy));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key", "x-request-id"],
    // Lets the frontend read the reference id to quote in a bug report, and when to retry.
    exposedHeaders: ["x-request-id", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

/** One line for the start-up log. */
export function describeCorsPolicy(env = process.env) {
  const policy = resolveCorsPolicy(env);
  const lines = [];
  for (const entry of policy.ignored) lines.push(`[cors] Ignoring CORS_ORIGINS entry "${entry}": it must be an origin like https://example.com (no wildcard, no path).`);
  if (policy.loopbackOnly) lines.push("[cors] CORS_ORIGINS not set: only localhost / 127.0.0.1 pages may read the API from a browser.");
  else if (policy.origins.size === 0) lines.push("[cors] CORS_ORIGINS has no valid origin: no other website may read the API from a browser.");
  else lines.push(`[cors] Allowed origins: ${[...policy.origins].join(", ")}`);
  return lines;
}
