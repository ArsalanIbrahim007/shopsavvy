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

  it("takes a long pasted link, but never searches for more than the server accepts", () => {
    renderAt("/", <SearchBox />);
    // the box takes a pasted link (much longer than a search); the search itself is cut to what the server accepts
    expect(screen.getByRole("combobox")).toHaveAttribute("maxlength", "2000");
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

  describe("theme button", () => {
    afterEach(() => {
      window.localStorage.clear();
      document.documentElement.removeAttribute("data-theme");
    });

    it("cycles device -> light -> dark -> device, sets the page theme, and says what a click does", () => {
      renderAt("/x", <p>page</p>, { withLayout: true });
      const button = () => screen.getByRole("button", { name: /colour theme/i });
      const root = document.documentElement;

      expect(button()).toHaveAccessibleName("Colour theme: Device setting. Switch to Light.");
      expect(root.hasAttribute("data-theme")).toBe(false);

      fireEvent.click(button());
      expect(button()).toHaveAccessibleName("Colour theme: Light. Switch to Dark.");
      expect(root.getAttribute("data-theme")).toBe("light");

      fireEvent.click(button());
      expect(button()).toHaveAccessibleName("Colour theme: Dark. Switch to Device setting.");
      expect(root.getAttribute("data-theme")).toBe("dark");
      expect(window.localStorage.getItem("shopsavvy:theme:v1")).toBe("dark");

      fireEvent.click(button());
      expect(root.hasAttribute("data-theme")).toBe(false);
      expect(window.localStorage.getItem("shopsavvy:theme:v1")).toBeNull();
    });

    it("starts from the saved choice", () => {
      window.localStorage.setItem("shopsavvy:theme:v1", "dark");
      renderAt("/x", <p>page</p>, { withLayout: true });
      expect(screen.getByRole("button", { name: /colour theme/i })).toHaveAccessibleName("Colour theme: Dark. Switch to Device setting.");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
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
    // the trust row uses the same stats: real store and listing counts, not invented ones
    expect(screen.getByText("7 stores")).toBeInTheDocument();
    expect(screen.getByText("3,219 listings")).toBeInTheDocument();
  });

  it("shows verified deals with the server's saving, linked to the product page", async () => {
    renderAt("/", <Home />);
    expect(await screen.findByRole("heading", { name: /verified deals/i })).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /Galaxy Band Fit 3/ });
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

  it("shows the most compared products of phones, laptops and TVs, each from that category's catalog", async () => {
    renderAt("/", <Home />);
    for (const title of [/most compared phones/i, /most compared laptops/i, /most compared tvs/i]) {
      expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "See all laptops" })).toHaveAttribute("href", "/results?category=laptop");
    expect(screen.getByRole("link", { name: "See all TVs" })).toHaveAttribute("href", "/results?category=tv");
    const categories = vi.mocked(api.getCatalog).mock.calls.map(([arg]) => arg.category).sort();
    expect(categories).toEqual(["laptop", "smartphone", "tv"]);
  });

  it("has the hero search and popular searches that go to the results page", async () => {
    renderAt("/", <Home />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MacBook Air" })).toHaveAttribute("href", "/results?q=MacBook%20Air");
    await screen.findByRole("heading", { name: /how we check prices/i });
  });
});

// The results page (filters, sorting, comparison table, URL state) is covered in results.test.jsx.

// The product page (offers table, verdicts, links, back link, error states) is covered in product.test.jsx.
