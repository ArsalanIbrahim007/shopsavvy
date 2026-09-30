import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  searchListings: vi.fn(),
  getCatalog: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import Results from "../src/pages/Results.jsx";

const NOW = new Date().toISOString();
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Phone", productCategory: "smartphone", imageUrl: "https://img.example.com/a.jpg",
  lastScrapedAt: NOW, inStock: true, storageGb: 256, ptaStatus: "pta_approved", colour: "Black", condition: "new",
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const group = (name, offers) => ({ productName: name, offerCount: offers.length, offers });

const A17 = group("Samsung Galaxy A17 256GB", [
  offer("a1", "priceoye", 64000, { dealScore: 92, recommendation: { action: "GOOD_DEAL", reason: "cheapest" } }),
  offer("a2", "mega", 65500),
  offer("a3", "shophive", 66000),
  offer("a4", "telemart", 67000),
]);
const A57 = group("Samsung Galaxy A57 128GB", [
  offer("b1", "priceoye", 110000, { storageGb: 128 }),
  offer("b2", "mega", 112000, { storageGb: 128, ptaStatus: "non_pta" }),
]);
const TV = group("Samsung 55 inch 4K TV", [
  offer("c1", "telemart", 90000, { productCategory: "tv", storageGb: null, ptaStatus: "unknown", screenInches: 55, resolution: "4K" }),
  offer("c2", "mega", 92000, { productCategory: "tv", storageGb: null, ptaStatus: "unknown", screenInches: 55, resolution: "FHD" }),
]);

const useLocationState = () => ({ state: useLocation().state });
const Where = () => {
  const { pathname, search } = useLocation();
  const { state } = useLocationState();
  return <><p data-testid="where">{decodeURIComponent(pathname + search)}</p><p data-testid="state">{state ? JSON.stringify(state) : ""}</p></>;
};

function renderResults(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<><Results /><Where /></>} /></Routes>
    </MemoryRouter>
  );
}
const where = () => screen.getByTestId("where").textContent;
const titles = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading", { level: 3 }).textContent);
const stores = () => within(screen.getByRole("complementary", { name: /filters/i }));
const store = (name) => stores().getByRole("checkbox", { name: new RegExp(`^${name}`, "i") });

function serve(groups, { total } = {}) {
  vi.mocked(api.searchListings).mockReset().mockResolvedValue({ offers: [], groups, groupCount: total ?? groups.length, summary: null });
  vi.mocked(api.getCatalog).mockReset().mockResolvedValue({ groups, total: total ?? groups.length, offset: 0, generatedAt: NOW });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  serve([A17, A57, TV]);
});
afterEach(() => vi.restoreAllMocks());

describe("Results: summary", () => {
  it("shows the headline numbers for what is on screen, and when the data is from", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article"); // the loading state has a heading too; wait for the real page
    expect(screen.getByRole("heading", { level: 1, name: /results for "samsung"/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("8 offers across 4 stores, grouped into 3 products");

    const cards = screen.getByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("Stores compared4");
    expect(cards).toHaveTextContent("PKR 64,000at PriceOye");
    expect(cards).toHaveTextContent("PKR 83,313"); // (64000+65500+66000+67000+110000+112000+90000+92000) / 8 = 83,312.5
    expect(cards).toHaveTextContent("PriceOyeDeal score 92 out of 100");
    expect(screen.getByText(/last updated just now/i)).toBeInTheDocument();
  });

  it("follows the filters: the numbers describe the offers still shown", async () => {
    renderResults("/results?q=samsung&platforms=mega");
    await screen.findAllByRole("article");
    const cards = screen.getByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("Stores compared1");
    expect(cards).toHaveTextContent("PKR 65,500at Mega.pk");
  });

  it("never presents an offer flagged as an unusual price as the lowest price", async () => {
    const odd = group("Samsung Galaxy A17 256GB", [
      offer("z1", "priceoye", 6400, { priceCheck: { status: "suspect_low", reason: "far below the other stores" } }),
      offer("z2", "mega", 65500), offer("z3", "shophive", 66000),
    ]);
    serve([odd]);
    renderResults("/results?q=a17");
    const cards = await screen.findByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("PKR 65,500at Mega.pk");
    expect(screen.getByRole("article")).not.toHaveTextContent("PKR 6,400");
  });
});

describe("Results: integrity strip", () => {
  it("says when offers with a doubtful discount or price are in view, quoting the server's reason", async () => {
    const fake = group("Samsung Galaxy S26 Plus", [
      offer("f1", "priceoye", 300000, { originalPrice: 400000, discountAnalysis: { classification: "likely_fake", isFakeDiscount: true, reason: "never sold at the claimed price" } }),
      offer("f2", "mega", 305000),
    ]);
    serve([fake]);
    renderResults("/results?q=s26");
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("ShopSavvy flagged 1 offer with a doubtful discount or price.");
    expect(note).toHaveTextContent("PriceOye: never sold at the claimed price");
  });

  it("is absent when nothing is doubtful", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("counts only what the filters leave in view: hiding the flagged store hides the note", async () => {
    const fake = group("Samsung Galaxy S26 Plus", [
      offer("f1", "priceoye", 300000, { discountAnalysis: { isFakeDiscount: true, classification: "likely_fake", reason: "why" } }), offer("f2", "mega", 305000),
    ]);
    serve([fake]);
    renderResults("/results?q=s26");
    await screen.findAllByRole("article");
    expect(screen.getByRole("note")).toBeInTheDocument();

    fireEvent.click(store("PriceOye"));
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Results: the product cards", () => {
  it("shows one compact card per product: name, best price and store, verdict, offers and stores", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    const card = screen.getAllByRole("article").find((a) => a.textContent.includes("Galaxy A17"));

    expect(card).toHaveTextContent("Samsung Galaxy A17 256GB");
    expect(card).toHaveTextContent("PKR 64,000");
    expect(card).toHaveTextContent("at PriceOye");
    expect(card).toHaveTextContent("Good deal");
    expect(card).toHaveTextContent("4 offers from 4 stores");
    expect(within(card).queryByRole("table")).toBeNull(); // the comparison table is on the product page
    expect(within(card).getByRole("link", { name: /Samsung Galaxy A17 256GB, from PKR 64,000/ })).toHaveAttribute("href", "/product/a1");
  });

  it("opens the product page from a card, remembering this exact list so Back can return to it", async () => {
    renderResults("/results?q=samsung&sort=lowestPrice&platforms=mega,priceoye");
    await screen.findAllByRole("article");
    fireEvent.click(screen.getAllByRole("link", { name: /Samsung Galaxy A17 256GB, from/ })[0]);
    expect(where()).toBe("/product/a1"); // the card opens its cheapest offer
    expect(screen.getByTestId("state")).toHaveTextContent("/results?q=samsung&sort=lowestPrice&platforms=mega,priceoye"); // the address as it was, filters included
  });

  it("does not show a good-deal badge next to a fake-discount warning on a card", async () => {
    const fake = group("Samsung Galaxy S26 Plus", [
      offer("f1", "priceoye", 300000, { recommendation: { action: "GOOD_DEAL", reason: "cheap" }, discountAnalysis: { classification: "likely_fake", isFakeDiscount: true, reason: "why" } }),
    ]);
    serve([fake]);
    renderResults("/results?q=s26");
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("Fake discount");
    expect(card).not.toHaveTextContent("Good deal");
  });

  it("prices a card at the lowest believable offer, never at an unusual price", async () => {
    const odd = group("Samsung Galaxy A17 256GB", [
      offer("z1", "priceoye", 6400, { priceCheck: { status: "suspect_low", reason: "far below the other stores" } }),
      offer("z2", "mega", 65500), offer("z3", "shophive", 66000),
    ]);
    serve([odd]);
    renderResults("/results?q=a17");
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("PKR 65,500");
    expect(card).toHaveTextContent("at Mega.pk");
    expect(card).not.toHaveTextContent("PKR 6,400");
  });
});

describe("Results: filters and sorting live in the URL", () => {
  it("lists the stores with their offer counts, all selected to begin with", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    for (const [name, count] of [["PriceOye", 2], ["Mega.pk", 3], ["Shophive", 1], ["Telemart", 2]]) {
      const box = store(name.replace(".", "\\."));
      expect(box).toBeChecked();
      expect(box.closest("label")).toHaveTextContent(String(count));
    }
  });

  it("filters by store, writes it to the URL, and does not ask the server again", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    expect(titles()).toHaveLength(3);

    fireEvent.click(store("Telemart"));
    expect(where()).toBe("/results?q=samsung&platforms=mega,priceoye,shophive"); // in the order the stores are listed (most offers first)
    // every product still has an offer somewhere else, so all three stay; the A17 loses only its Telemart row
    expect(titles()).toHaveLength(3);
    expect(screen.getAllByRole("article").find((a) => a.textContent.includes("A17"))).toHaveTextContent("3 offers from 3 stores");
    expect(screen.getAllByRole("article").find((a) => a.textContent.includes("TV"))).toHaveTextContent("1 offer from 1 store");
    expect(api.searchListings).toHaveBeenCalledTimes(1);
  });

  it("always keeps at least one store selected", async () => {
    renderResults("/results?q=samsung&platforms=shophive");
    await screen.findAllByRole("article");
    fireEvent.click(store("Shophive"));
    expect(store("Shophive")).toBeChecked();
    expect(where()).toContain("platforms=shophive");
  });

  it("selecting every store again removes the store filter from the URL", async () => {
    renderResults("/results?q=samsung&platforms=priceoye,mega,shophive");
    await screen.findAllByRole("article");
    fireEvent.click(store("Telemart"));
    expect(where()).toBe("/results?q=samsung");
  });

  it("sorts by lowest price, reorders the products, and remembers it in the URL", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    expect(titles()[0]).toBe("Samsung Galaxy A17 256GB"); // most offers first by default

    fireEvent.click(stores().getByRole("radio", { name: /lowest price/i }));
    expect(where()).toContain("sort=lowestPrice");
    expect(titles()).toEqual(["Samsung Galaxy A17 256GB", "Samsung 55 inch 4K TV", "Samsung Galaxy A57 128GB"]);
    expect(stores().getByRole("radio", { name: /lowest price/i })).toBeChecked();
  });

  it("applies a price range when the field is left, and shows it in the URL", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    const min = stores().getByLabelText("Min");
    expect(min).toHaveAttribute("placeholder", "64,000");

    fireEvent.change(min, { target: { value: "100000" } });
    expect(where()).toBe("/results?q=samsung"); // typing alone changes nothing
    fireEvent.blur(min);
    expect(where()).toContain("minPrice=100000");
    expect(titles()).toEqual(["Samsung Galaxy A57 128GB"]);

    fireEvent.change(stores().getByLabelText("Max"), { target: { value: "111000" } });
    fireEvent.keyDown(stores().getByLabelText("Max"), { key: "Enter" });
    expect(where()).toContain("maxPrice=111000");
    expect(screen.getByRole("group", { name: /summary/i })).toHaveTextContent("PKR 110,000");
  });

  it("offers the options of the results' main category with counts, and filters by them", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    const storage = stores().getByText("Storage").closest("fieldset");
    expect(within(storage).getByRole("checkbox", { name: /256 GB/ }).closest("label")).toHaveTextContent("4");
    expect(within(storage).getByRole("checkbox", { name: /128 GB/ }).closest("label")).toHaveTextContent("2");
    expect(stores().queryByText("Screen size")).toBeNull(); // a TV-only facet is not offered for phones

    fireEvent.click(within(storage).getByRole("checkbox", { name: /128 GB/ }));
    expect(where()).toContain("storage=128");
    expect(titles()).toEqual(["Samsung Galaxy A57 128GB"]);
  });

  it("switches category, clears the previous category's facet choices, and offers the new category's filters", async () => {
    renderResults("/results?q=samsung&storage=256");
    await screen.findAllByRole("article");
    fireEvent.click(stores().getByRole("button", { name: /^tv/i }));
    expect(where()).toBe("/results?q=samsung&category=tv");
    expect(titles()).toEqual(["Samsung 55 inch 4K TV"]);
    expect(stores().getByText("Resolution")).toBeInTheDocument();
    expect(stores().queryByText("Storage")).toBeNull();

    fireEvent.click(stores().getByRole("button", { name: /^all/i }));
    expect(where()).toBe("/results?q=samsung");
  });

  it("does not accept a negative price bound", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    fireEvent.change(stores().getByLabelText("Min"), { target: { value: "-5" } });
    fireEvent.blur(stores().getByLabelText("Min"));
    expect(where()).toBe("/results?q=samsung");
    expect(titles()).toHaveLength(3);
  });

  it("starts from a shared URL: everything in it is applied", async () => {
    renderResults("/results?q=samsung&platforms=priceoye,mega&minPrice=100000&sort=lowestPrice&storage=128");
    await screen.findAllByRole("article");
    expect(titles()).toEqual(["Samsung Galaxy A57 128GB"]);
    expect(store("Telemart")).not.toBeChecked();
    expect(stores().getByRole("radio", { name: /lowest price/i })).toBeChecked();
    expect(stores().getByLabelText("Min")).toHaveValue(100000);
  });

  it("ignores junk in the URL instead of breaking", async () => {
    renderResults("/results?q=samsung&sort=bogus&minPrice=abc&platforms=,,&storage=x,y");
    await screen.findAllByRole("article");
    expect(titles()).toHaveLength(3);
  });

  it("offers Reset only when something is selected, and it puts the URL back", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    expect(screen.queryByRole("button", { name: /reset filters/i })).toBeNull();

    fireEvent.click(store("Mega\\.pk"));
    fireEvent.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(where()).toBe("/results?q=samsung");
    expect(store("Mega\\.pk")).toBeChecked();
  });

  it("says so when the filters leave nothing, with a way back", async () => {
    renderResults("/results?q=samsung&minPrice=900000");
    expect(await screen.findByRole("heading", { name: /no products match these filters/i })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /reset filters/i }).at(-1));
    expect(await screen.findAllByRole("article")).toHaveLength(3);
    expect(where()).toBe("/results?q=samsung");
  });

  it("opens and closes the filters on a phone with the toggle button", async () => {
    renderResults("/results?q=samsung");
    await screen.findAllByRole("article");
    const toggle = screen.getByRole("button", { name: /filters and sorting/i });
    const panel = screen.getByRole("complementary", { name: /filters/i });
    expect(panel).not.toHaveClass("is-open");
    fireEvent.click(toggle);
    expect(panel).toHaveClass("is-open");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Results: browsing a category", () => {
  it("loads the catalog, hides the category chips (the category is the page), and says how many products there are", async () => {
    serve([A17, A57], { total: 1034 });
    renderResults("/results?category=smartphone");
    await screen.findAllByRole("article");
    expect(screen.getByRole("heading", { level: 1, name: "Smartphones" })).toBeInTheDocument();
    expect(api.getCatalog).toHaveBeenCalledWith(expect.objectContaining({ category: "smartphone", limit: 50 }));
    expect(api.searchListings).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Showing the 2 most compared of 1,034; filters apply to these");
    expect(stores().queryByText("Category")).toBeNull();
    expect(screen.queryByRole("button", { name: /reset filters/i })).toBeNull(); // the category itself is not a filter to undo
  });

  it("never offers to switch category while browsing one, even if the data holds several", async () => {
    serve([A17, TV], { total: 2 });
    renderResults("/results?category=smartphone");
    await screen.findAllByRole("article");
    expect(stores().queryByRole("button", { name: /^all/i })).toBeNull();
    expect(stores().queryByText("Category")).toBeNull();
  });

  it("keeps the category in the URL when filtering, and Reset keeps it too", async () => {
    serve([A17, A57]);
    renderResults("/results?category=smartphone");
    await screen.findAllByRole("article");
    fireEvent.click(stores().getByRole("radio", { name: /lowest price/i }));
    expect(where()).toBe("/results?category=smartphone&sort=lowestPrice");
    fireEvent.click(store("Telemart"));
    expect(where()).toBe("/results?category=smartphone&platforms=mega,priceoye,shophive&sort=lowestPrice");
    fireEvent.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(where()).toBe("/results?category=smartphone");
    expect(api.getCatalog).toHaveBeenCalledTimes(1);
  });
});

describe("Results: paging, and the states around the data", () => {
  it("draws 20 products at a time, and the rest on request", async () => {
    const many = Array.from({ length: 45 }, (_, i) => group(`Phone ${i}`, [offer(`p${i}`, "priceoye", 1000 + i), offer(`q${i}`, "mega", 2000 + i)]));
    serve(many);
    renderResults("/results?q=phone");
    await screen.findAllByRole("article");
    expect(screen.getAllByRole("article")).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: /show more products \(25 left\)/i }));
    expect(screen.getAllByRole("article")).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: /show more products \(5 left\)/i }));
    expect(screen.getAllByRole("article")).toHaveLength(45);
    expect(screen.queryByRole("button", { name: /show more products/i })).toBeNull();
  });

  it("starts from the top again when a filter changes", async () => {
    const many = Array.from({ length: 45 }, (_, i) => group(`Phone ${i}`, [offer(`p${i}`, "priceoye", 1000 + i), offer(`q${i}`, "mega", 2000 + i)]));
    serve(many);
    renderResults("/results?q=phone");
    await screen.findAllByRole("article");
    fireEvent.click(screen.getByRole("button", { name: /show more products/i }));
    expect(screen.getAllByRole("article")).toHaveLength(40);
    fireEvent.click(stores().getByRole("radio", { name: /lowest price/i }));
    expect(screen.getAllByRole("article")).toHaveLength(20);
  });

  it("does not ask the server anything for a missing, unknown or non-browsable category", () => {
    for (const path of ["/results", "/results?category=toaster", "/results?category=accessory", "/results?q="]) {
      const { unmount } = renderResults(path);
      expect(screen.getByText(/no products found/i), path).toBeInTheDocument();
      unmount();
    }
    expect(api.searchListings).not.toHaveBeenCalled();
    expect(api.getCatalog).not.toHaveBeenCalled();
  });

  it("says so when nothing matches the search, and offers a way back", async () => {
    serve([]);
    renderResults("/results?q=zzzz");
    expect(await screen.findByRole("heading", { name: /no products found for "zzzz"/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home page/i })).toHaveAttribute("href", "/");
  });

  it("shows the server's reason and reference id when the request fails, and no retry when it would not help", async () => {
    vi.mocked(api.searchListings).mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", message: "Too many searches from this address.", requestId: "r-3" }));
    renderResults("/results?q=iphone");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many searches from this address.");
    expect(alert).toHaveTextContent("Reference: r-3");
    expect(within(alert).queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("retries a failed search when the failure is temporary", async () => {
    vi.mocked(api.searchListings).mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    renderResults("/results?q=iphone");
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findAllByRole("article")).toHaveLength(3);
  });

  it("shows a loading state with an honest note about slow first searches", () => {
    vi.mocked(api.searchListings).mockReturnValue(new Promise(() => {}));
    renderResults("/results?q=iphone");
    expect(screen.getByRole("status")).toHaveTextContent(/can take up to a minute/i);
  });
});
