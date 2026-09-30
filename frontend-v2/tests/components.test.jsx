import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getStats: vi.fn(),
  getDeals: vi.fn(),
  getCatalog: vi.fn(),
  getHealth: vi.fn(),
  searchListings: vi.fn(),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import SearchBox from "../src/components/SearchBox.jsx";
import ErrorBoundary from "../src/components/ErrorBoundary.jsx";
import ProductImage from "../src/components/ProductImage.jsx";
import VerdictBadge from "../src/components/VerdictBadge.jsx";
import Layout from "../src/components/Layout.jsx";
import Home from "../src/pages/Home.jsx";
import Results from "../src/pages/Results.jsx";
import Product from "../src/pages/Product.jsx";

const NOW = new Date().toISOString();
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Samsung Galaxy A17", imageUrl: "https://img.example.com/a.jpg", lastScrapedAt: NOW,
  productUrl: `https://${platform}.example.com/a17`, recommendation: { action: "GOOD_DEAL", reason: "cheapest" }, ...over,
});
const group = (name, offers) => ({ productName: name, offerCount: offers.length, offers });

const Where = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
};

function renderAt(path, element, { withLayout = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {withLayout ? (
          <Route element={<Layout />}>
            <Route path="*" element={element} />
          </Route>
        ) : (
          <Route path="*" element={<>{element}<Where /></>} />
        )}
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.getSuggestions).mockReset().mockResolvedValue([]);
  vi.mocked(api.getHealth).mockReset().mockResolvedValue({ status: "ok", lastScrapeAt: NOW });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("SearchBox", () => {
  const suggestions = [
    { text: "Samsung Galaxy A17", category: "smartphone", count: 12 },
    { text: "Samsung Galaxy A57", category: "smartphone", count: 12 },
  ];
  const type = (box, value) => fireEvent.change(box, { target: { value } });

  it("suggests once the shopper pauses, using the trimmed text, and shows each suggestion's category", async () => {
    vi.mocked(api.getSuggestions).mockImplementation(async (q) => (q === "galaxy a" ? suggestions : []));
    renderAt("/", <SearchBox />);
    const box = screen.getByRole("combobox", { name: /search products/i });

    for (const partial of ["g", "ga", "  galaxy a  "]) type(box, partial);
    const options = await screen.findAllByRole("option");

    expect(options.map((o) => o.textContent)).toEqual(["Samsung Galaxy A17Smartphones", "Samsung Galaxy A57Smartphones"]);
    expect(api.getSuggestions.mock.calls.map(([q]) => q)).not.toContain("g"); // typed before the pause: never requested
    expect(api.getSuggestions).toHaveBeenLastCalledWith("galaxy a", expect.objectContaining({ limit: 6 }));
    expect(box).toHaveAttribute("aria-expanded", "true");
  });

  it("waits for a pause before asking the server (not on every keystroke)", async () => {
    vi.mocked(api.getSuggestions).mockResolvedValue(suggestions);
    renderAt("/", <SearchBox />);
    type(screen.getByRole("combobox"), "galaxy a");

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.getSuggestions.mock.calls.map(([q]) => q)).not.toContain("galaxy a"); // still inside the 200 ms pause
    await screen.findAllByRole("option");
    expect(api.getSuggestions.mock.calls.map(([q]) => q)).toContain("galaxy a");
  });

  it("shows nothing for a single character, even if the server would answer", async () => {
    vi.mocked(api.getSuggestions).mockResolvedValue(suggestions);
    renderAt("/", <SearchBox />);
    type(screen.getByRole("combobox"), "a");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves through suggestions with the arrow keys and searches the highlighted one on Enter", async () => {
    vi.mocked(api.getSuggestions).mockResolvedValue(suggestions);
    renderAt("/", <SearchBox />);
    const box = screen.getByRole("combobox");
    type(box, "galaxy");
    await screen.findAllByRole("option");

    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(box.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);

    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "ArrowUp" }); // wraps to the last
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.submit(box.closest("form"));
    expect(screen.getByTestId("where")).toHaveTextContent("/results?q=Samsung+Galaxy+A57");
  });

  it("searches what was typed when nothing is highlighted, and ignores an empty box", async () => {
    renderAt("/", <SearchBox />);
    const box = screen.getByRole("combobox");

    fireEvent.submit(box.closest("form"));
    type(box, "   ");
    fireEvent.submit(box.closest("form"));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);

    type(box, "  iphone 17 pro  ");
    fireEvent.submit(box.closest("form"));
    expect(screen.getByTestId("where")).toHaveTextContent("/results?q=iphone+17+pro");
  });

  it("encodes special characters in the URL", () => {
    renderAt("/", <SearchBox />);
    const box = screen.getByRole("combobox");
    type(box, "a&b=c #1");
    fireEvent.submit(box.closest("form"));
    expect(screen.getByTestId("where")).toHaveTextContent("/results?q=a%26b%3Dc+%231");
  });

  it("closes on Escape and on a click outside, and searches a suggestion when it is pressed", async () => {
    vi.mocked(api.getSuggestions).mockResolvedValue(suggestions);
    renderAt("/", <><SearchBox /><button>elsewhere</button></>);
    const box = screen.getByRole("combobox");

    type(box, "galaxy");
    await screen.findByRole("listbox");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    type(box, "galaxy a");
    await screen.findByRole("listbox");
    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.focus(box);
    fireEvent.mouseDown(await screen.findByText("Samsung Galaxy A17"));
    expect(screen.getByTestId("where")).toHaveTextContent("/results?q=Samsung+Galaxy+A17");
  });

  it("stops the shopper typing more than the server accepts", () => {
    renderAt("/", <SearchBox />);
    expect(screen.getByRole("combobox")).toHaveAttribute("maxlength", "100");
  });

  it("starts with the current search filled in", () => {
    renderAt("/results?q=iphone", <SearchBox initialQuery="iphone" />);
    expect(screen.getByRole("combobox")).toHaveValue("iphone");
  });
});

describe("Layout", () => {
  it("has a skip link, a labelled main region, search everywhere but the home page, and shows data freshness", async () => {
    renderAt("/results?q=iphone", <p>page</p>, { withLayout: true });
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("combobox")).toHaveValue("iphone");
    expect(await screen.findByText(/prices last updated/i)).toBeInTheDocument();
    expect(screen.getByText(/we don't take money from stores/i)).toBeInTheDocument();
  });

  it("leaves the header search out on the home page, where the hero has one", () => {
    renderAt("/", <p>home</p>, { withLayout: true });
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("still renders the footer when the health check fails", async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new ApiError({ status: 503, code: "DATABASE_UNAVAILABLE" }));
    renderAt("/x", <p>page</p>, { withLayout: true });
    expect(await screen.findByText(/free to use/i)).toBeInTheDocument();
    expect(screen.queryByText(/prices last updated/i)).toBeNull();
  });
});

describe("ErrorBoundary", () => {
  const Boom = () => { throw new Error("render failure"); };

  it("replaces a crashed page with a plain message and a way out, and keeps siblings alive", () => {
    render(<><p>header</p><ErrorBoundary><Boom /></ErrorBoundary></>);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong on this page/i);
    expect(screen.getByRole("link", { name: /home page/i })).toHaveAttribute("href", "/");
    expect(screen.getByText("header")).toBeInTheDocument();
    expect(screen.queryByText(/render failure/)).toBeNull(); // the error text is not shown to shoppers
  });

  it("renders children normally when nothing fails", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});

describe("ProductImage", () => {
  it("shows the photo, and a placeholder when the address is missing, unsafe or broken", () => {
    const { container, rerender } = render(<ProductImage src="https://img.example.com/x.jpg" alt="Phone" />);
    expect(screen.getByRole("img", { name: "Phone" })).toHaveAttribute("src", "https://img.example.com/x.jpg");

    fireEvent.error(screen.getByRole("img", { name: "Phone" }));
    expect(container.querySelector("img")).toBeNull();

    for (const bad of [undefined, "", "javascript:alert(1)", "data:text/html,x", "not a url"]) {
      rerender(<ProductImage src={bad} alt="Phone" />);
      expect(container.querySelector("img"), String(bad)).toBeNull();
    }
  });

  it("does not send the store a referrer and loads lazily", () => {
    render(<ProductImage src="https://img.example.com/x.jpg" alt="Phone" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("loading", "lazy");
  });
});

describe("VerdictBadge", () => {
  it("shows a symbol and a word, with the symbol hidden from screen readers, and falls back for an unknown tone", () => {
    const { container, rerender } = render(<VerdictBadge tone="bad" label="Fake discount" title="why" />);
    expect(screen.getByText("Fake discount").closest(".badge")).toHaveClass("badge-bad");
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("✕");
    expect(screen.getByTitle("why")).toBeInTheDocument();

    rerender(<VerdictBadge tone="sparkly" label="Odd" />);
    expect(screen.getByText("Odd").closest(".badge")).toHaveClass("badge-neutral");
  });
});

describe("Home", () => {
  const stats = { products: 3219, platforms: 7, categories: [{ category: "smartphone", count: 1368 }, { category: "tv", count: 571 }, { category: "accessory", count: 235 }] };
  const deal = (id) => ({
    productName: "Galaxy Band Fit 3", category: "smartwatch", imageUrl: "https://img.example.com/b.jpg", offerCount: 3, storeCount: 3,
    lowest: { _id: id, platform: "telemart", price: 10799 }, referencePrice: 14499, savingAmount: 3700, savingPercent: 25.5, updatedAt: NOW,
  });

  beforeEach(() => {
    vi.mocked(api.getStats).mockReset().mockResolvedValue(stats);
    vi.mocked(api.getDeals).mockReset().mockResolvedValue({ deals: [deal("d1")], generatedAt: NOW, maxAgeHours: 72 });
    vi.mocked(api.getCatalog).mockReset().mockResolvedValue({ groups: [group("Samsung Galaxy A17", [offer("p1", "priceoye", 64000), offer("p2", "mega", 65500)])], total: 1, offset: 0, generatedAt: NOW });
  });

  it("shows the category tiles with real counts, and no tile for accessories", async () => {
    renderAt("/", <Home />);
    const tile = await screen.findByRole("link", { name: /smartphones.*1,368 listings/i });
    expect(tile).toHaveAttribute("href", "/results?category=smartphone");
    expect(screen.getByRole("link", { name: /tvs.*571/i })).toBeInTheDocument();
    expect(screen.queryByText(/accessor/i)).toBeNull();
    expect(screen.getByText(/3,219 listings from 7 stores/i)).toBeInTheDocument();
  });

  it("shows verified deals with the server's saving, linked to the product page", async () => {
    renderAt("/", <Home />);
    expect(await screen.findByRole("heading", { name: /verified deals/i })).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /Galaxy Band Fit 3, PKR 10,799 at Telemart/ });
    expect(card).toHaveAttribute("href", "/product/d1");
    expect(screen.getByText(/26% below typical/)).toBeInTheDocument();
    expect(screen.getByText(/save about PKR 3,700/i)).toBeInTheDocument();
  });

  it("hides the deals section entirely when there are none, or when the request fails", async () => {
    vi.mocked(api.getDeals).mockResolvedValue({ deals: [], generatedAt: NOW, maxAgeHours: 72 });
    const { unmount } = renderAt("/", <Home />);
    await screen.findByRole("heading", { name: /browse by category/i });
    await waitFor(() => expect(api.getDeals).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /verified deals/i })).toBeNull();
    unmount();

    vi.mocked(api.getDeals).mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    renderAt("/", <Home />);
    expect(await screen.findByRole("heading", { name: /most compared phones/i })).toBeInTheDocument(); // the rest of the page is unaffected
    expect(screen.queryByRole("heading", { name: /verified deals/i })).toBeNull();
  });

  it("says plainly when the server is unavailable, with a way to retry, and keeps the rest of the page", async () => {
    vi.mocked(api.getStats).mockRejectedValueOnce(new ApiError({ status: 503, code: "DATABASE_UNAVAILABLE", requestId: "req-9" }));
    renderAt("/", <Home />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert).toHaveTextContent("Reference: req-9");

    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("link", { name: /smartphones/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/know if the price is real/i);
  });

  it("has the hero search and popular searches that go to the results page", async () => {
    renderAt("/", <Home />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MacBook Air" })).toHaveAttribute("href", "/results?q=MacBook%20Air");
    await screen.findByRole("heading", { name: /how we check prices/i });
  });
});

describe("Results", () => {
  const twoGroups = [
    group("Samsung Galaxy A17", [offer("p1", "priceoye", 64000), offer("p2", "mega", 65500)]),
    group("Samsung Galaxy A57", [offer("p3", "priceoye", 110000)]),
  ];

  beforeEach(() => {
    vi.mocked(api.searchListings).mockReset().mockResolvedValue({ offers: [], groups: twoGroups, groupCount: 2, summary: null });
    vi.mocked(api.getCatalog).mockReset().mockResolvedValue({ groups: twoGroups, total: 2, offset: 0, generatedAt: NOW });
  });

  it("searches, shows the count, and one card per product with the best price and the store count", async () => {
    renderAt("/results?q=galaxy", <Results />);
    expect(await screen.findByRole("heading", { level: 1, name: /results for "galaxy"/i })).toBeInTheDocument();
    expect(await screen.findByText("2 products")).toBeInTheDocument();
    expect(api.searchListings).toHaveBeenCalledWith(expect.objectContaining({ q: "galaxy" }));

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("PKR 64,000");
    expect(cards[0]).toHaveTextContent("2 offers from 2 stores");
    expect(cards[1]).toHaveTextContent("1 offer from 1 store");
    expect(within(cards[0]).getByRole("link", { name: /Samsung Galaxy A17/ })).toHaveAttribute("href", "/product/p1");
  });

  it("browses a category from the catalog when there is no search text", async () => {
    renderAt("/results?category=smartphone", <Results />);
    expect(await screen.findByRole("heading", { level: 1, name: "Smartphones" })).toBeInTheDocument();
    await screen.findAllByRole("article");
    expect(api.getCatalog).toHaveBeenCalledWith(expect.objectContaining({ category: "smartphone" }));
    expect(api.searchListings).not.toHaveBeenCalled();
  });

  it("does not ask the server anything for a missing, unknown or non-browsable category", async () => {
    for (const path of ["/results", "/results?category=toaster", "/results?category=accessory", "/results?q="]) {
      const { unmount } = renderAt(path, <Results />);
      expect(screen.getByText(/no products found/i), path).toBeInTheDocument();
      unmount();
    }
    expect(api.searchListings).not.toHaveBeenCalled();
    expect(api.getCatalog).not.toHaveBeenCalled();
  });

  it("says so when nothing matches, and offers a way back", async () => {
    vi.mocked(api.searchListings).mockResolvedValue({ offers: [], groups: [], groupCount: 0, summary: null });
    renderAt("/results?q=zzzz", <Results />);
    expect(await screen.findByRole("heading", { name: /no products found for "zzzz"/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home page/i })).toHaveAttribute("href", "/");
  });

  it("shows the reason and a retry when the request fails, and works after retrying", async () => {
    vi.mocked(api.searchListings).mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", message: "Too many searches from this address.", requestId: "r-3" }));
    renderAt("/results?q=iphone", <Results />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many searches from this address.");
    expect(alert).toHaveTextContent("Reference: r-3");
    expect(within(alert).queryByRole("button", { name: /try again/i })).toBeNull(); // a rate limit is not fixed by retrying at once
  });

  it("retries a failed search when the failure is temporary", async () => {
    vi.mocked(api.searchListings).mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    renderAt("/results?q=iphone", <Results />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("2 products")).toBeInTheDocument();
  });

  it("shows a loading state with an honest note about slow first searches", () => {
    vi.mocked(api.searchListings).mockReturnValue(new Promise(() => {}));
    renderAt("/results?q=iphone", <Results />);
    expect(screen.getByRole("status")).toHaveTextContent(/can take up to a minute/i);
  });

  it("draws at most 48 cards and says how many products there are", async () => {
    const many = Array.from({ length: 60 }, (_, i) => group(`Phone ${i}`, [offer(`id${i}`, "priceoye", 1000 + i)]));
    vi.mocked(api.searchListings).mockResolvedValue({ offers: [], groups: many, groupCount: 734, summary: null });
    renderAt("/results?q=samsung", <Results />);
    expect(await screen.findByText(/734 products, showing the 48 with the most offers/)).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(48);
  });

  it("does not show a good-deal badge next to a fake-discount warning on a card", async () => {
    const fake = offer("f1", "priceoye", 90000, { discountAnalysis: { classification: "likely_fake", reason: "never sold at the claimed price" } });
    vi.mocked(api.searchListings).mockResolvedValue({ offers: [], groups: [group("Samsung Galaxy S26 Plus", [fake])], groupCount: 1, summary: null });
    renderAt("/results?q=s26", <Results />);
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("Fake discount");
    expect(card).not.toHaveTextContent("Good deal");
  });
});

describe("Product", () => {
  const renderProduct = (id = "p1") =>
    render(
      <MemoryRouter initialEntries={[`/product/${id}`]}>
        <Routes><Route path="/product/:id" element={<Product />} /></Routes>
      </MemoryRouter>
    );

  it("shows the product, its verdict, a safe store link, and every offer cheapest first with this one marked", async () => {
    const mine = offer("p1", "priceoye", 65000);
    vi.mocked(api.getListing).mockResolvedValue({
      listing: mine,
      offers: [mine, offer("p2", "mega", 63000), offer("p3", "shophive", 66000)],
      summary: null, productGroup: null,
    });
    renderProduct();

    expect(await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17" })).toBeInTheDocument();
    const view = screen.getByRole("link", { name: /view at priceoye/i });
    expect(view).toHaveAttribute("href", "https://priceoye.example.com/a17");
    expect(view).toHaveAttribute("rel", "noopener noreferrer");
    expect(view).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Good deal")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3 offers from 3 stores" })).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["PKR 63,000", "PKR 65,000", "PKR 66,000"]);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[1]).toHaveTextContent("(this one)");
  });

  it("never links to an unsafe store address: the button is shown as unavailable", async () => {
    const bad = offer("p1", "priceoye", 65000, { productUrl: "javascript:alert(1)", sourceUrl: "data:text/html,x" });
    vi.mocked(api.getListing).mockResolvedValue({ listing: bad, offers: [bad], summary: null, productGroup: null });
    renderProduct();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: /view at/i })).toBeNull();
    expect(screen.getByText("Link unavailable")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("tells not-found apart from a server problem, with the reference id and the right actions", async () => {
    vi.mocked(api.getListing).mockRejectedValueOnce(new ApiError({ status: 404, code: "NOT_FOUND", requestId: "r-4" }));
    const { unmount } = renderProduct("missing");
    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't find/i);
    expect(alert).toHaveTextContent("Reference: r-4");
    expect(within(alert).queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("link", { name: /back to the home page/i })).toBeInTheDocument();
    unmount();

    vi.mocked(api.getListing).mockRejectedValueOnce(new ApiError({ status: 503, code: "DATABASE_UNAVAILABLE" }));
    renderProduct("p1");
    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows a loading placeholder first", () => {
    vi.mocked(api.getListing).mockReturnValue(new Promise(() => {}));
    const { container } = renderProduct();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
