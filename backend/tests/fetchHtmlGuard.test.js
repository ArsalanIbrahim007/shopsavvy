import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import axios from "axios";
import { lookup } from "node:dns/promises";
import { fetchHtml } from "../src/scrapers/scraper.utils.js";
import { assertRedirectIsPublic } from "../src/services/outboundUrlGuard.service.js";

// fetchHtml is what every HTML scraper uses to fetch a page (CodeQL alert #3): it must never be talked into fetching this machine,
// its network, or a cloud metadata address, whatever URL it is given and wherever the page redirects to.

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

beforeEach(() => {
  vi.mocked(axios.get).mockReset().mockResolvedValue({ data: "<html>ok</html>" });
  vi.mocked(lookup).mockReset().mockResolvedValue(PUBLIC);
});

describe("fetchHtml refuses private targets without making a request", () => {
  it("refuses an address on this machine or its network, and the cloud metadata address", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/", "http://localhost:5000/api/listings", "http://127.0.0.1/", "http://10.0.0.5/admin",
      "http://192.168.1.1/", "http://[::1]/", "http://2130706433/", "file:///etc/passwd", "http://user:pass@www.mega.pk/",
    ]) {
      await expect(fetchHtml(url), url).rejects.toThrow(/^fetchHtml refused /);
    }
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("refuses a public-looking name whose DNS answer is a private address", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(fetchHtml("https://innocent.example.com/")).rejects.toThrow(/refused .*points at a private address/);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("does not retry a refused address", async () => {
    await expect(fetchHtml("http://localhost/", { retries: 3 })).rejects.toThrow(/refused/);
    expect(lookup).not.toHaveBeenCalled(); // refused by its form, before any lookup
    vi.mocked(lookup).mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(fetchHtml("https://innocent.example.com/", { retries: 3 })).rejects.toThrow(/refused/);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe("fetchHtml still fetches the public web", () => {
  it("fetches a public site, returns the page, and asks axios to check every redirect", async () => {
    const html = await fetchHtml("https://www.mega.pk/search/iphone+17/");
    expect(html).toBe("<html>ok</html>");
    expect(axios.get).toHaveBeenCalledTimes(1);
    const [url, config] = vi.mocked(axios.get).mock.calls[0];
    expect(url).toBe("https://www.mega.pk/search/iphone+17/");
    expect(config.beforeRedirect).toBe(assertRedirectIsPublic);
    expect(config).toMatchObject({ maxRedirects: 5, responseType: "text", timeout: 10000 });
    expect(config.headers["User-Agent"]).toBeTruthy();
  });

  it("keeps a visitor's text in the path from changing the host", async () => {
    await fetchHtml("https://www.mega.pk/search/@127.0.0.1/");
    expect(axios.get).toHaveBeenCalledTimes(1);
    await expect(fetchHtml("https://www.mega.pk@127.0.0.1/")).rejects.toThrow(/refused/);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("retries a DNS failure that only stopped the check, the way it retries any temporary failure", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("EAI_AGAIN")).mockResolvedValue(PUBLIC);
    const html = await fetchHtml("https://www.mega.pk/", { retries: 1 });
    expect(html).toBe("<html>ok</html>");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("gives up on a DNS failure that never clears, with fetchHtml's usual error", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchHtml("https://www.mega.pk/", { retries: 1 })).rejects.toThrow(/^fetchHtml failed for https:\/\/www\.mega\.pk\/: .*could not be resolved/);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("still retries a temporary server error and stops at a permanent one, as before", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(Object.assign(new Error("boom"), { response: { status: 503 } })).mockResolvedValue({ data: "later" });
    expect(await fetchHtml("https://www.mega.pk/", { retries: 1 })).toBe("later");
    expect(axios.get).toHaveBeenCalledTimes(2);

    vi.mocked(axios.get).mockReset().mockRejectedValue(Object.assign(new Error("gone"), { response: { status: 404 } }));
    await expect(fetchHtml("https://www.mega.pk/missing", { retries: 3 })).rejects.toThrow(/HTTP 404/);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
