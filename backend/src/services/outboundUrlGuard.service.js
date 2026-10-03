// outboundUrlGuard.service.js — a server that fetches URLs must not be talked into fetching ITS OWN network.
//
// Server-side request forgery (CodeQL alert #3, "critical"): the scrapers fetch pages by URL, and part of some URLs comes from a visitor's
// search, or (the dormant Google discovery layer) from search results. An address such as http://169.254.169.254/ (a cloud server's
// credential service), http://localhost:5000/ (this API's own admin routes) or http://10.0.0.5/ (the school or office network) must never
// be fetched on someone else's say-so. Every store ShopSavvy scrapes is a public website, so the rule is simple: only http(s) URLs to
// public internet addresses.
//
// assertPublicUrl(url) checks the URL as written AND what its host name resolves to (a name that points at a private address is refused,
// and so is a name with ANY private address among several). assertRedirectIsPublic is for axios' `beforeRedirect`: it can only look at the
// host name and any literal address, because a redirect hook cannot wait for a DNS answer; a redirect to a name that resolves to a private
// address is therefore the one case this does not stop on its own (a limit, stated here rather than hidden).

import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

// Addresses that are not on the public internet. net.BlockList treats an IPv4-mapped IPv6 address (::ffff:127.0.0.1) as the IPv4 one.
const NOT_PUBLIC = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]]) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}

/** True when `address` (an IPv4 or IPv6 literal) is loopback, private, link-local, multicast, reserved or otherwise not public. */
export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return true; // not an address at all: do not call it public
  return NOT_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

const PRIVATE_NAME = /(^|\.)(localhost|local|internal|localdomain|home|lan|corp)$/;

/** Checks a URL without resolving anything. Returns the parsed URL. */
export function assertPublicUrlSync(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError(`Only http and https are fetched, not ${url.protocol}`);
  if (url.username || url.password) throw new UnsafeUrlError("A URL with credentials in it is not fetched.");

  // IPv6 literals come in brackets; the URL parser has already turned 2130706433, 0x7f.1 and similar into dotted form.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("A URL with no host is not fetched.");

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("That address is not on the public internet.");
    return url;
  }
  if (PRIVATE_NAME.test(host) || !host.includes(".")) throw new UnsafeUrlError("That host name is not a public website.");
  return url;
}

/** Checks a URL and what its host name resolves to. Throws UnsafeUrlError, otherwise returns the parsed URL. */
export async function assertPublicUrl(value, { resolve = lookup } = {}) {
  const url = assertPublicUrlSync(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return url;

  let addresses;
  try {
    addresses = await resolve(host, { all: true });
  } catch {
    throw new UnsafeUrlError("That host name could not be resolved, so it cannot be checked.");
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new UnsafeUrlError("That host name has no address.");
  if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new UnsafeUrlError("That host name points at a private address.");
  return url;
}

/**
 * For axios' `beforeRedirect(options)`: throws when a redirect would leave the public internet (by name or literal address).
 * @param {{protocol?: string, hostname?: string, host?: string, port?: string|number, path?: string}} options
 */
export function assertRedirectIsPublic(options = {}) {
  const host = options.hostname || String(options.host ?? "").replace(/:\d+$/, "");
  const bracketed = net.isIPv6(host) ? `[${host}]` : host;
  assertPublicUrlSync(`${options.protocol || "https:"}//${bracketed}${options.port ? `:${options.port}` : ""}${options.path || "/"}`);
}
