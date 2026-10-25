// proxy.js — whether to believe the X-Forwarded-For header, and how far (Express's "trust proxy").
//
// Every rate limit in this app is per visitor address (req.ip). On a hosting platform the app sits behind the host's proxy, so
// without this every request seems to come from the proxy itself: all visitors share one counter, and the site locks everyone
// out together once a few people search. Behind a proxy, Express must take the visitor's address from X-Forwarded-For instead.
// That header is written by whoever sends the request, so it may only be believed for the hops we know are our own proxies:
// trusting it from anyone lets a script send a new made-up address with every request and never be limited.
//
// Policy (TRUST_PROXY):
//  - not set, "false" or "0": no proxy (local development, or the app facing the internet itself). X-Forwarded-For is ignored.
//  - a number of hops, 1 to 10: the addresses added by that many proxies are believed. Most hosts (Render, Railway, Heroku,
//    Fly.io, a single nginx) are 1.
//  - addresses: a comma separated list of the proxies' IP addresses or subnets (10.0.0.0/8), or the names "loopback",
//    "linklocal", "uniquelocal" (private ranges, for a proxy on the same machine or network).
//  - "true" (believe every hop) is refused with a warning, like "*" in CORS_ORIGINS: it is the setting that lets a client choose
//    its own address.

import net from "node:net";

const NAMED_RANGES = new Set(["loopback", "linklocal", "uniquelocal"]);
const MAX_HOPS = 10;

function isAddressOrSubnet(entry) {
  if (NAMED_RANGES.has(entry)) return true;
  const [address, bits, extra] = entry.split("/");
  const version = net.isIP(address);
  if (!version || extra !== undefined) return false;
  if (bits === undefined) return true;
  const max = version === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(bits) && Number(bits) <= max;
}

/**
 * The value for app.set("trust proxy") from TRUST_PROXY, and what was refused.
 * @returns {{ value: false|number|string, ignored: string|null }}
 */
export function resolveTrustProxy(env = process.env) {
  const raw = String(env.TRUST_PROXY ?? "").trim();
  if (raw === "" || raw === "false" || raw === "0") return { value: false, ignored: null };

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    return hops >= 1 && hops <= MAX_HOPS ? { value: hops, ignored: null } : { value: false, ignored: raw };
  }

  const entries = raw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (entries.length > 0 && entries.every(isAddressOrSubnet)) return { value: entries.join(","), ignored: null };
  return { value: false, ignored: raw };
}

/** Lines for the start-up log. */
export function describeTrustProxy(env = process.env) {
  const { value, ignored } = resolveTrustProxy(env);
  const lines = [];
  if (ignored !== null) {
    lines.push(`[proxy] Ignoring TRUST_PROXY="${ignored}": use a number of proxy hops (1 to ${MAX_HOPS}) or the proxies' addresses, ` +
      "never \"true\". X-Forwarded-For is not believed.");
  }
  if (value === false) {
    lines.push("[proxy] TRUST_PROXY not set: visitor addresses are taken from the connection. Behind a host's proxy, set TRUST_PROXY=1, " +
      "or every visitor shares one rate limit.");
  } else {
    lines.push(`[proxy] Trusting X-Forwarded-For from: ${typeof value === "number" ? `${value} proxy hop${value === 1 ? "" : "s"}` : value}`);
  }
  return lines;
}
