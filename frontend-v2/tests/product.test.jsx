import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import Product from "../src/pages/Product.jsx";

const NOW = new Date().toISOString();
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Samsung Galaxy A17 256GB", productCategory: "smartphone", imageUrl: "https://img.example.com/a.jpg",
  lastScrapedAt: NOW, inStock: true, productUrl: `https://${platform}.example.com/${id}`, dealScore: 70,
  recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});

const Where = () => <p data-testid="where">{decodeURIComponent(useLocation().pathname + useLocation().search)}</p>;

function renderProduct(id = "p1", state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/product/${id}`, state }]}>
      <Routes>
        <Route path="/product/:id" element={<Product />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function serve(offers, { current = offers[0], name } = {}) {
  vi.mocked(api.getListing).mockReset().mockResolvedValue({
    listing: current, offers, summary: null, productGroup: name ? { productName: name } : null,
  });
}

const rowsOf = () => screen.getAllByRole("row").slice(1);
const priceOf = (row) => within(row).getAllByRole("cell")[1].textContent;

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const four = () => [
  offer("p1", "priceoye", 64000, { recommendation: { action: "GOOD_DEAL", reason: "cheapest" } }),
  offer("p2", "mega", 65500), offer("p3", "shophive", 66000), offer("p4", "telemart", 67000),
];

describe("Product page: the product and its offers", () => {
  it("shows the product's name, best price and store, saving and verdict, then every offer cheapest first", async () => {
    serve(four(), { name: "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved" }); // the group's name, not this listing's own title
    renderProduct();

    expect(await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved" })).toBeInTheDocument();
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("PKR 64,000");
    expect(card).toHaveTextContent("Lowest at PriceOye");
    expect(card).toHaveTextContent("4 offers from 4 stores · you can save up to PKR 3,000");
    expect(card).toHaveTextContent("Good deal");
    expect(card).toHaveTextContent("Smartphones");

    // no "show more" here: the page exists to compare every store
    expect(rowsOf().map(priceOf)).toEqual(["PKR 64,000", "PKR 65,500", "PKR 66,000", "PKR 67,000"]);
    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
    expect(rowsOf()[0]).toHaveClass("is-lowest");
    expect(rowsOf()[0]).toHaveTextContent("Lowest price");
    expect(rowsOf()[1]).not.toHaveClass("is-lowest");
  });

  it("labels the listing the shopper opened", async () => {
    const offers = four();
    serve(offers, { current: offers[2] });
    renderProduct("p3");
    await screen.findByRole("article");
    expect(rowsOf()[2]).toHaveTextContent("The one you opened");
    expect(screen.getAllByText("The one you opened")).toHaveLength(1);
  });

  it("names the product from the listing when the server sent no group name, and copes with an empty offers list", async () => {
    const lone = offer("p1", "priceoye", 64000, { title: "Samsung Galaxy A17 6GB 128GB" });
    vi.mocked(api.getListing).mockResolvedValue({ listing: lone, offers: [], summary: null, productGroup: null });
    renderProduct();
    expect(await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17 6GB 128GB" })).toBeInTheDocument();
    expect(rowsOf().map(priceOf)).toEqual(["PKR 64,000"]);
    expect(screen.getByRole("article")).toHaveTextContent("1 offer from 1 store");
  });

  it("lists the offers cheapest first even when the server sends them in another order", async () => {
    serve([offer("s1", "telemart", 70000), offer("s2", "priceoye", 64000), offer("s3", "mega", 66000)]);
    renderProduct("s1");
    await screen.findByRole("article");
    expect(rowsOf().map(priceOf)).toEqual(["PKR 64,000", "PKR 66,000", "PKR 70,000"]);
  });

  it("never presents an unusual price as the lowest, and does not count it towards the saving", async () => {
    serve([
      offer("o1", "priceoye", 6400, { priceCheck: { status: "suspect_low", reason: "far below the other stores" } }),
      offer("o2", "mega", 65500), offer("o3", "shophive", 66000),
    ]);
    renderProduct("o1");
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("you can save up to PKR 500"); // 66,000 - 65,500, not 59,600
    expect(card).toHaveTextContent("Lowest at Mega.pk");
    const rows = rowsOf();
    expect(rows.find((r) => r.textContent.includes("PriceOye"))).not.toHaveClass("is-lowest");
    expect(rows.find((r) => r.textContent.includes("PriceOye"))).toHaveTextContent("Unusual price");
  });

  it("shows a verdict rather than repeating a store's claim, the was-price, stock and freshness", async () => {
    serve([
      offer("d1", "priceoye", 300000, { originalPrice: 400000, discountAnalysis: { classification: "likely_fake", isFakeDiscount: true, reason: "never sold at that price" }, lastScrapedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() }),
      offer("d2", "mega", 305000, { originalPrice: 366000, inStock: false }),
      offer("d3", "shophive", 310000),
    ]);
    renderProduct("d1");
    await screen.findByRole("article");
    const rows = rowsOf();

    expect(rows[0]).toHaveTextContent("Fake discount");
    expect(rows[0]).toHaveTextContent("PKR 400,000"); // the store's was-price, struck through
    expect(rows[0]).toHaveTextContent("3 h ago");
    expect(rows[1]).toHaveTextContent("Claims 17% off"); // an unchecked claim is labelled as a claim
    expect(rows[1]).toHaveTextContent("Out of stock");
    expect(rows[2]).toHaveTextContent("No discount claimed");
    expect(rows[2]).toHaveTextContent("In stock");
  });

  it("does not show a good-deal badge next to a fake-discount warning", async () => {
    serve([offer("f1", "priceoye", 300000, { recommendation: { action: "GOOD_DEAL", reason: "cheap" }, discountAnalysis: { classification: "likely_fake", isFakeDiscount: true, reason: "why" } })]);
    renderProduct("f1");
    const head = (await screen.findByRole("article")).querySelector(".result-group__badges");
    expect(head).toHaveTextContent("Fake discount");
    expect(head).not.toHaveTextContent("Good deal");
  });

  it("gives each offer a store link that opens safely, and marks an unusable address as unavailable", async () => {
    serve([offer("m1", "priceoye", 64000), offer("m2", "mega", 65000, { productUrl: "javascript:alert(1)", sourceUrl: "data:text/html,x" })]);
    renderProduct("m1");
    const card = await screen.findByRole("article");
    const link = within(card).getByRole("link", { name: "View deal at PriceOye" });
    expect(link).toHaveAttribute("href", "https://priceoye.example.com/m1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(card).queryByRole("link", { name: /view deal at mega/i })).toBeNull();
    expect(within(card).getByText("Unavailable")).toBeInTheDocument();
  });

  it("marks the cheapest offer's link as the main action", async () => {
    serve(four());
    renderProduct();
    await screen.findByRole("article");
    expect(within(rowsOf()[0]).getByRole("link")).toHaveClass("btn-accent");
    expect(within(rowsOf()[1]).getByRole("link")).toHaveClass("btn-ghost");
  });
});

describe("Product page: the name", () => {
  it("keeps the title of the card that was clicked, even if the page's own grouping names the product differently", async () => {
    serve(four(), { name: "Orient 40 Inch FHD LED TV (LE40G6520)" });
    renderProduct("p1", { from: "/results?category=tv", name: "Orient 40 Inch FHD Falcon LED TV" });
    expect(await screen.findByRole("heading", { level: 1, name: "Orient 40 Inch FHD Falcon LED TV" })).toBeInTheDocument();
  });

  it("falls back to the page's own name when the state holds no usable title", async () => {
    for (const name of ["", "   ", 5, null, {}]) {
      serve(four(), { name: "Samsung Galaxy A17 8GB" });
      const { unmount } = renderProduct("p1", { from: "/results?q=x", name });
      expect(await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17 8GB" }), String(name)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("Product page: back link", () => {
  beforeEach(() => serve([offer("p1", "priceoye", 64000)]));

  it("returns to the exact list the shopper came from, filters included", async () => {
    renderProduct("p1", { from: "/results?q=samsung&sort=lowestPrice&platforms=mega" });
    await screen.findByRole("article");
    const link = screen.getByRole("link", { name: /back to results/i });
    fireEvent.click(link);
    expect(screen.getByTestId("where")).toHaveTextContent("/results?q=samsung&sort=lowestPrice&platforms=mega");
  });

  it("goes home when there is no list to return to (a shared link)", async () => {
    renderProduct("p1");
    await screen.findByRole("article");
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /back to results/i })).toBeNull();
  });

  it("ignores an address that is not a path inside this site", async () => {
    for (const from of ["//evil.example.com/x", "https://evil.example.com", "javascript:alert(1)", 42, null, {}]) {
      const { unmount } = renderProduct("p1", { from });
      await screen.findByRole("article");
      expect(screen.getByRole("link", { name: /home/i }), String(from)).toHaveAttribute("href", "/");
      unmount();
    }
  });
});

describe("Product page: loading and failure", () => {
  it("shows a loading placeholder first, with the way back already there", () => {
    vi.mocked(api.getListing).mockReturnValue(new Promise(() => {}));
    const { container } = renderProduct("p1", { from: "/results?q=x" });
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("link", { name: /back to results/i })).toBeInTheDocument();
  });

  it("tells not-found apart from a server problem, with the reference id and the right actions", async () => {
    vi.mocked(api.getListing).mockRejectedValueOnce(new ApiError({ status: 404, code: "NOT_FOUND", requestId: "r-4" }));
    const { unmount } = renderProduct("missing");
    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't find/i);
    expect(alert).toHaveTextContent("Reference: r-4");
    expect(within(alert).queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    unmount();

    vi.mocked(api.getListing).mockRejectedValueOnce(new ApiError({ status: 503, code: "DATABASE_UNAVAILABLE" }));
    renderProduct("p1");
    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("retries after a temporary failure", async () => {
    vi.mocked(api.getListing).mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    vi.mocked(api.getListing).mockResolvedValue({ listing: offer("p1", "priceoye", 64000), offers: [offer("p1", "priceoye", 64000)], summary: null, productGroup: null });
    renderProduct("p1");
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("article")).toBeInTheDocument();
  });
});
