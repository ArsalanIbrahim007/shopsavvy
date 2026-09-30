import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  searchListings: vi.fn(),
  getCatalog: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { linkStoreName, looksLikeLink, parseProductLink, unreadableMessage } from "../src/lib/productLink.js";
import SearchBox from "../src/components/SearchBox.jsx";
import LinkNotice from "../src/components/results/LinkNotice.jsx";
import Results from "../src/pages/Results.jsx";

const link = (text) => parseProductLink(text);

describe("parseProductLink: reading a product name out of an address", () => {
  it("reads Amazon's readable part, dropping the colour and selling words, and returns the capacity separately", () => {
    expect(link("https://www.amazon.com/Apple-iPhone-17-Pro-Max-256GB-Cosmic-Orange-Unlocked-Smartphone/dp/B0DX12345?ref=abc")).toEqual({
      kind: "link", query: "Apple iPhone 17 Pro Max", capacities: ["256GB"], store: "Amazon", host: "amazon.com",
    });
  });

  it("takes every capacity out of the search (most Pakistani titles omit it), and is not fooled by a name that is only a capacity", () => {
    expect(link("https://www.daraz.pk/products/samsung-galaxy-a17-6gb-128gb-i123456-s789.html")).toMatchObject({ query: "samsung galaxy a17", capacities: ["6GB", "128GB"] });
    expect(link("https://www.ebay.com/itm/Apple-iPad-Air-11-M3-1TB-WiFi/314159265358")).toMatchObject({ query: "Apple iPad Air 11 M3", capacities: ["1TB"] });
    expect(link("https://www.amazon.com/iPhone-17/dp/B0").capacities).toEqual([]);
    expect(link("https://www.example.com/products/256gb-512gb")).toMatchObject({ kind: "unreadable", reason: "no-name" });
  });

  it("reads Temu, Shein, Alibaba, eBay and Daraz addresses, each with its own kind of id removed", () => {
    expect(link("https://www.temu.com/xiaomi-14-ultra-512gb-g-601099512345678.html")).toMatchObject({ query: "xiaomi 14 ultra", store: "Temu" });
    expect(link("https://www.shein.com/Men-Cotton-Hoodie-p-123456-cat-1234.html")).toMatchObject({ query: "Men Cotton Hoodie", store: "Shein" });
    expect(link("https://www.alibaba.com/product-detail/Samsung-Galaxy-S24-Ultra-256GB_1600123456789.html")).toMatchObject({ query: "Samsung Galaxy S24 Ultra", store: "Alibaba" });
    expect(link("https://www.ebay.com/itm/Apple-iPad-Air-11-M3-256GB-WiFi/314159265358")).toMatchObject({ query: "Apple iPad Air 11 M3", store: "eBay" });
    expect(link("https://www.daraz.pk/products/samsung-galaxy-a17-6gb-128gb-i123456-s789.html")).toMatchObject({ query: "samsung galaxy a17", store: "Daraz" });
  });

  it("reads a search-style address (?k=, ?keywords=, ?title=), and an address typed without https://", () => {
    expect(link("https://www.amazon.com/s?k=sony+wh-1000xm5+headphones")).toMatchObject({ query: "sony wh-1000xm5 headphones" });
    expect(link("https://www.example.com/list?keywords=airpods%20pro")).toMatchObject({ query: "airpods pro", store: null });
    expect(link("www.amazon.com/Sony-WH-1000XM5-Headphones/dp/B09XS7JWHH")).toMatchObject({ kind: "link", host: "amazon.com" });
  });

  it("leaves out words that describe the listing rather than the product", () => {
    expect(link("https://www.amazon.com/Samsung-Galaxy-S24-Smartphone-Unlocked-Original-Global/dp/B0")).toMatchObject({ query: "Samsung Galaxy S24" });
    expect(link("https://www.amazon.com/2025-New-Hot-Sale-Xiaomi-Redmi-Note-14/dp/B0")).toMatchObject({ query: "2025 Xiaomi Redmi Note 14" });
  });

  it("works for other countries' stores and never searches for more than six words", () => {
    expect(link("https://www.amazon.co.uk/Dyson-V15-Detect-Absolute-Cordless-Vacuum-Cleaner/dp/B09X")).toMatchObject({ store: "Amazon", query: "Dyson V15 Detect Absolute Cordless Vacuum" });
    expect(link("https://www.amazon.com/Apple-iPhone-17-Pro-Max-256GB-Cosmic-Orange-Unlocked/dp/B0DX").query.split(" ").length).toBeLessThanOrEqual(6);
  });

  it("says so when the address has no product name in it, instead of guessing", () => {
    expect(link("https://www.amazon.com/dp/B0DX12345")).toEqual({ kind: "unreadable", store: "Amazon", host: "amazon.com", reason: "no-name" });
    expect(link("https://www.aliexpress.com/item/1005006123456789.html")).toMatchObject({ kind: "unreadable", store: "AliExpress", reason: "no-name" });
    expect(link("https://www.example.com/")).toMatchObject({ kind: "unreadable", reason: "no-name" });
  });

  it("says so for a shortened link, which does not contain the product", () => {
    for (const short of ["https://amzn.to/3xyz", "https://a.co/d/abc", "https://s.click.aliexpress.com/e/_abc", "https://bit.ly/3abc"]) {
      expect(link(short)).toMatchObject({ kind: "unreadable", reason: "short" });
    }
  });

  it("treats anything that is not a web address as text to search, including dangerous schemes", () => {
    for (const text of ["iphone 17 pro", "", "   ", "samsung s24 ultra 256gb", "javascript:alert(1)", "ftp://x.com/a-b-c", "data:text/html,<b>x</b>"]) {
      expect(link(text)).toEqual({ kind: "text" });
    }
    expect(looksLikeLink("iphone 17")).toBe(false);
    expect(looksLikeLink("https://www.amazon.com/x-y/dp/B0")).toBe(true);
    expect(looksLikeLink(undefined)).toBe(false);
  });

  it("does not choke on junk: huge input, broken escapes, odd characters", () => {
    expect(link("https://www.amazon.com/" + "a-".repeat(3000))).toEqual({ kind: "text" }); // longer than an address can sensibly be
    expect(link("https://www.amazon.com/%E0%A4%A-bad-escape-name-here/dp/B0")).toMatchObject({ kind: "link" });
    expect(link("https://www.example.com/<script>-alert-product-name")).toMatchObject({ kind: "link" });
  });

  it("names the store, and explains the two ways a link can be unreadable", () => {
    expect(linkStoreName("amazon.com")).toBe("Amazon");
    expect(linkStoreName("www.temu.com")).toBe("Temu");
    expect(linkStoreName("evil.example")).toBeNull();
    expect(linkStoreName(undefined)).toBeNull();
    expect(unreadableMessage({ store: null, reason: "short" })).toMatch(/shortened link/);
    expect(unreadableMessage({ store: "AliExpress", reason: "no-name" })).toMatch(/AliExpress links often have none/);
    expect(unreadableMessage({ store: null, reason: "no-name" })).not.toMatch(/\(/);
  });
});

const Where = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{decodeURIComponent((pathname + search).replaceAll("+", " "))}</p>;
};
const inApp = (ui, path = "/") => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>
);
const where = () => screen.getByTestId("where").textContent;
const type = (value) => fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const submit = () => fireEvent.submit(screen.getByRole("search"));

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(api.getSuggestions).mockReset().mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("SearchBox with a pasted link", () => {
  it("searches the product named in the link and remembers where it came from", () => {
    inApp(<SearchBox />);
    type("https://www.amazon.com/Apple-iPhone-17-Pro-Max-256GB-Cosmic-Orange-Unlocked-Smartphone/dp/B0DX12345?ref=abc");
    submit();
    expect(where()).toBe("/results?q=Apple iPhone 17 Pro Max&from=amazon.com&cap=256GB");
    expect(JSON.parse(window.localStorage.getItem("shopsavvy:recent-searches:v1"))).toEqual(["Apple iPhone 17 Pro Max"]); // the name, not the link
  });

  it("does not leave the page for a link with no name in it, says why, and keeps what was pasted", () => {
    inApp(<SearchBox />);
    type("https://www.aliexpress.com/item/1005006123456789.html");
    submit();
    expect(where()).toBe("/");
    expect(screen.getByRole("alert")).toHaveTextContent(/AliExpress links often have none/);
    expect(screen.getByRole("combobox")).toHaveValue("https://www.aliexpress.com/item/1005006123456789.html");
    type("iphone 17"); // typing again clears the message
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells a shopper about a shortened link", () => {
    inApp(<SearchBox />);
    type("https://amzn.to/3xyz");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(/shortened link/);
  });

  it("still searches typed text as before, without a link origin", () => {
    inApp(<SearchBox />);
    type("  iphone 17  ");
    submit();
    expect(where()).toBe("/results?q=iphone 17");
  });

  it("cuts a very long typed search to what the server accepts", () => {
    inApp(<SearchBox />);
    type("x".repeat(150));
    submit();
    expect(where().replace("/results?q=", "")).toHaveLength(100);
  });

  it("shows no suggestion list while a link is in the box, but still does for typed text", async () => {
    vi.mocked(api.getSuggestions).mockResolvedValue([{ text: "Apple iPhone 17", category: "smartphone", count: 3 }]);
    inApp(<SearchBox />);
    type("https://www.amazon.com/Apple-iPhone-17/dp/B0");
    await new Promise((resolve) => setTimeout(resolve, 400)); // past the pause after which suggestions arrive
    expect(screen.queryByRole("listbox")).toBeNull();
    type("apple iph");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });
});

describe("LinkNotice and the results page", () => {
  const NOW = new Date().toISOString();
  const offer = (id, platform, price) => ({
    _id: id, platform, price, title: "Phone", productCategory: "smartphone", imageUrl: "https://img.example.com/a.jpg", lastScrapedAt: NOW, inStock: true,
    storageGb: 256, ptaStatus: "pta_approved", colour: "Black", condition: "new", productUrl: `https://${platform}.example.com/${id}`, dealScore: 70,
    recommendation: { action: "FAIR_PRICE", reason: "fine" },
  });
  const serve = () => {
    const groups = [{ productName: "Apple iPhone 17 Pro Max 256GB", offerCount: 2, offers: [offer("a", "mega", 400000), offer("b", "shophive", 410000)] }];
    vi.mocked(api.searchListings).mockReset().mockResolvedValue({ offers: [], groups, groupCount: 1, summary: null });
  };

  it("says what was done and what to keep in mind", () => {
    render(<LinkNotice store="Amazon" query="Apple iPhone 17 Pro Max 256GB" />);
    const notice = screen.getByRole("complementary", { name: /about this search/i });
    expect(notice).toHaveTextContent("Pakistani prices for “Apple iPhone 17 Pro Max 256GB”");
    expect(notice).toHaveTextContent("your Amazon link");
    expect(notice).toHaveTextContent(/we did not open the page/);
    expect(notice).toHaveTextContent(/another currency.*shipping and import duty/);
  });

  it("says which capacity the link was for, and shows nothing it was not given as a plain capacity", () => {
    const { unmount } = render(<LinkNotice store="Amazon" query="Apple iPhone 17 Pro Max" capacity="256GB" />);
    expect(screen.getByRole("complementary")).toHaveTextContent(/Your link mentions 256GB.*check it on each product/);
    unmount();
    render(<LinkNotice store="Amazon" query="x" capacity="<b>evil</b>,8GB,256GB" />);
    expect(screen.getByRole("complementary")).toHaveTextContent("Your link mentions 8GB and 256GB");
    expect(screen.getByRole("complementary")).not.toHaveTextContent("evil");
  });

  it("does not name a store it does not know", () => {
    render(<LinkNotice store={null} query="airpods pro" />);
    expect(screen.getByRole("complementary")).toHaveTextContent("the link you pasted");
  });

  it("is shown on a results page that came from a link, and kept while the shopper filters", async () => {
    serve();
    inApp(<Results />, "/results?q=Apple%20iPhone%2017%20Pro%20Max&from=amazon.com&cap=256GB");
    expect(await screen.findByRole("complementary", { name: /about this search/i })).toHaveTextContent("your Amazon link");
    fireEvent.click(screen.getByRole("radio", { name: /lowest price/i }));
    expect(where()).toContain("from=amazon.com");
    expect(where()).toContain("cap=256GB");
    expect(screen.getByRole("complementary", { name: /about this search/i })).toBeInTheDocument();
  });

  it("is not shown for an ordinary search, and a made-up origin never becomes a store name", async () => {
    serve();
    const first = inApp(<Results />, "/results?q=iphone");
    await screen.findAllByRole("article");
    expect(screen.queryByRole("complementary", { name: /about this search/i })).toBeNull();
    first.unmount();

    inApp(<Results />, "/results?q=iphone&from=totally-legit-bank.example");
    expect(await screen.findByRole("complementary", { name: /about this search/i })).toHaveTextContent("the link you pasted");
  });
});
