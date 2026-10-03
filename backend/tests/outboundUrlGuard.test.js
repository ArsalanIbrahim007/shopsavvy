import { describe, it, expect, vi } from "vitest";

import { UnsafeUrlError, assertPublicUrl, assertPublicUrlSync, assertRedirectIsPublic, isPrivateAddress } from "../src/services/outboundUrlGuard.service.js";

// The URLs a server must never be talked into fetching (CodeQL alert #3).

describe("isPrivateAddress", () => {
  it("is true for loopback, private, link-local (the cloud credential service), shared, multicast and reserved IPv4 addresses", () => {
    for (const ip of [
      "127.0.0.1", "127.255.255.254", "10.0.0.5", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254",
      "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255", "198.18.0.1",
    ]) expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("is false for public IPv4 addresses, including the ones next to a private range", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.15.255.255", "172.32.0.1", "11.0.0.1", "192.167.255.255", "192.169.0.1", "100.63.255.255", "100.128.0.1", "169.253.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("covers IPv6: loopback, unspecified, unique-local, link-local, multicast, and IPv4-mapped private addresses", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "2001:db8::1", "febf::1", "ffff::1", "fdff:ffff::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("is true for something that is not an address, rather than assuming it is public", () => {
    for (const bad of ["", "example.com", "999.1.1.1", "1.2.3", undefined, null]) expect(isPrivateAddress(bad), String(bad)).toBe(true);
  });
});

describe("assertPublicUrlSync", () => {
  const refused = (url) => expect(() => assertPublicUrlSync(url), url).toThrow(UnsafeUrlError);

  it("refuses an address on this machine or its network, in every way of writing it", () => {
    for (const url of [
      "http://localhost:5000/api/listings", "http://LOCALHOST/", "http://localhost./", "http://app.localhost/", "http://127.0.0.1/", "http://127.1/",
      "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://10.1.2.3:8080/",
      "http://192.168.1.1/admin", "http://169.254.169.254/latest/meta-data/", "http://[fe80::1]/", "http://0.0.0.0/",
    ]) refused(url);
  });

  it("refuses names that are not public websites: internal suffixes and single-label names", () => {
    for (const url of ["http://printer.local/", "http://db.internal/", "http://nas.lan/", "http://intranet/", "http://router.home/", "http://x.localdomain/", "http://wiki.corp/"]) refused(url);
  });

  it("refuses anything but http and https, a URL with credentials, one with no host, and text that is not a URL", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "data:text/html,x", "http://user:pass@example.com/", "http://user@example.com/", "http:///path", "not a url", "", undefined]) refused(url);
  });

  it("accepts an ordinary public site, a public IP, a port, a path and a query, and returns the parsed URL", () => {
    expect(assertPublicUrlSync("https://www.mega.pk/search/iphone+17/?q=1").hostname).toBe("www.mega.pk");
    expect(assertPublicUrlSync("http://93.184.216.34:8080/x").port).toBe("8080");
    expect(assertPublicUrlSync("https://[2606:4700:4700::1111]/").protocol).toBe("https:");
    expect(assertPublicUrlSync("https://EXAMPLE.com./").hostname).toBe("example.com.");
  });

  it("does not take a private host from a look-alike: the visitor's text after the host is only a path", () => {
    expect(assertPublicUrlSync("https://www.mega.pk/search/@127.0.0.1/").hostname).toBe("www.mega.pk");
    expect(() => assertPublicUrlSync("https://www.mega.pk@127.0.0.1/")).toThrow(UnsafeUrlError); // credentials, and the real host is 127.0.0.1
    expect(assertPublicUrlSync("https://www.mega.pk/search/..%2f..%2fetc/").hostname).toBe("www.mega.pk");
  });
});

describe("assertPublicUrl (resolves the host name too)", () => {
  const resolving = (...addresses) => vi.fn(async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));

  it("accepts a name that resolves only to public addresses", async () => {
    const resolve = resolving("93.184.216.34", "2606:4700:4700::1111");
    const url = await assertPublicUrl("https://shop.example.com/p", { resolve });
    expect(url.hostname).toBe("shop.example.com");
    expect(resolve).toHaveBeenCalledWith("shop.example.com", { all: true });
  });

  it("refuses a public-looking name that points at a private address (DNS pointed inwards)", async () => {
    await expect(assertPublicUrl("https://evil.example.com/", { resolve: resolving("127.0.0.1") })).rejects.toThrow(/private address/);
    await expect(assertPublicUrl("https://evil.example.com/", { resolve: resolving("169.254.169.254") })).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("https://evil.example.com/", { resolve: resolving("::1") })).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses a name with ANY private address among several, since the connection may use that one", async () => {
    await expect(assertPublicUrl("https://mixed.example.com/", { resolve: resolving("93.184.216.34", "10.0.0.5") })).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses a name that cannot be resolved or has no address, since it cannot be checked", async () => {
    await expect(assertPublicUrl("https://nowhere.example.com/", { resolve: vi.fn(async () => { throw new Error("ENOTFOUND"); }) })).rejects.toThrow(/could not be resolved/);
    await expect(assertPublicUrl("https://empty.example.com/", { resolve: vi.fn(async () => []) })).rejects.toThrow(/no address/);
  });

  it("does not resolve anything for an address literal, and refuses a private one before any lookup", async () => {
    const resolve = resolving("93.184.216.34");
    await assertPublicUrl("http://93.184.216.34/", { resolve });
    expect(resolve).not.toHaveBeenCalled();
    await expect(assertPublicUrl("http://127.0.0.1/", { resolve })).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("file:///etc/passwd", { resolve })).rejects.toThrow(UnsafeUrlError);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("assertRedirectIsPublic (axios beforeRedirect)", () => {
  it("lets a redirect to a public host through, and stops one to a private address or an internal name", () => {
    expect(() => assertRedirectIsPublic({ protocol: "https:", hostname: "www.mega.pk", path: "/search/x/" })).not.toThrow();
    expect(() => assertRedirectIsPublic({ protocol: "http:", hostname: "93.184.216.34", port: 8080, path: "/" })).not.toThrow();
    for (const options of [
      { protocol: "http:", hostname: "169.254.169.254", path: "/latest/meta-data/" },
      { protocol: "http:", hostname: "localhost", port: 5000, path: "/api/listings" },
      { protocol: "https:", hostname: "::1", path: "/" },
      { protocol: "http:", host: "10.0.0.5:8080", path: "/" },
      { protocol: "file:", hostname: "example.com", path: "/etc/passwd" },
      { protocol: "http:", hostname: "db.internal", path: "/" },
    ]) expect(() => assertRedirectIsPublic(options), JSON.stringify(options)).toThrow(UnsafeUrlError);
  });

  it("lets a public redirect through however the host is given: a bare host with a port, or an IPv6 address", () => {
    expect(() => assertRedirectIsPublic({ protocol: "https:", host: "www.mega.pk:443", path: "/x" })).not.toThrow();
    expect(() => assertRedirectIsPublic({ protocol: "https:", hostname: "2606:4700:4700::1111", path: "/" })).not.toThrow();
    expect(() => assertRedirectIsPublic({ protocol: "http:", hostname: "fe80::1", path: "/" })).toThrow(UnsafeUrlError);
  });

  it("copes with options that are missing parts", () => {
    expect(() => assertRedirectIsPublic({ hostname: "www.mega.pk" })).not.toThrow();
    expect(() => assertRedirectIsPublic({})).toThrow(UnsafeUrlError);
    expect(() => assertRedirectIsPublic()).toThrow(UnsafeUrlError);
  });
});
