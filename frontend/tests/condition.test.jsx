import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axe from "axe-core";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  searchListings: vi.fn(),
  getCatalog: vi.fn(),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { allPreOwned, comparableOffers, conditionFlag, conditionNotice, isPreOwned, splitByCondition } from "../src/lib/condition.js";
import { bestDealOffer } from "../src/lib/score.js";
import { summarizeOffers } from "../src/lib/summary.js";
import Product from "../src/pages/Product.jsx";
import Results from "../src/pages/Results.jsx";

const NOW = new Date().toISOString();
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Samsung Galaxy A17 256GB", productCategory: "smartphone", imageUrl: "https://img.example.com/a.jpg",
  lastScrapedAt: NOW, inStock: true, storageGb: 256, ptaStatus: "pta_approved", colour: "Black", condition: "new",
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const used = (id, platform, price, over = {}) => offer(id, platform, price, { condition: "used", dealScore: 99, ...over });
const group = (name, offers) => ({ productName: name, offerCount: offers.length, offers });

describe("isPreOwned and conditionFlag", () => {
  it("labels used, refurbished and open-box offers, each with a reason that says it is not compared with new ones", () => {
    for (const [condition, label] of [["used", "Used"], ["refurbished", "Refurbished"], ["open_box", "Open box"]]) {
      expect(isPreOwned({ condition })).toBe(true);
      expect(conditionFlag({ condition })).toMatchObject({ label, tone: "caution" });
      expect(conditionFlag({ condition }).reason).toMatch(/not compared with new ones/);
    }
  });

  it("says nothing about a new offer, one with no condition, an unknown condition, or no offer", () => {
    for (const value of [{ condition: "new" }, {}, { condition: "damaged" }, { condition: null }, null, undefined]) {
      expect(isPreOwned(value)).toBe(false);
      expect(conditionFlag(value)).toBeNull();
    }
  });
});

describe("comparableOffers and allPreOwned", () => {
  const n1 = offer("n1", "mega", 100);
  const u1 = used("u1", "mega", 50);
  const r1 = offer("r1", "mega", 60, { condition: "refurbished" });

  it("keeps only the new offers when there are any", () => {
    expect(comparableOffers([u1, n1, r1])).toEqual([n1]);
  });

  it("keeps all of them when none is new, so a page of refurbished laptops still has a lowest price", () => {
    expect(comparableOffers([u1, r1])).toEqual([u1, r1]);
  });

  it("gives an empty list for nothing", () => {
    expect(comparableOffers([])).toEqual([]);
    expect(comparableOffers(undefined)).toEqual([]);
  });

  it("is true only for a non-empty list of pre-owned offers", () => {
    expect(allPreOwned([u1, r1])).toBe(true);
    expect(allPreOwned([u1, n1])).toBe(false);
    expect(allPreOwned([])).toBe(false);
    expect(allPreOwned(undefined)).toBe(false);
  });
});

describe("splitByCondition", () => {
  const fresh = group("New phone", [offer("n1", "mega", 100)]);
  const secondhand = group("Used phone", [used("u1", "mega", 50), offer("r1", "telemart", 60, { condition: "refurbished" })]);
  const mixed = group("Odd phone", [offer("n2", "mega", 100), used("u2", "telemart", 50)]);

  it("separates products that are entirely pre-owned from the rest, keeping the order", () => {
    const { fresh: f, preOwned: p } = splitByCondition([fresh, secondhand, mixed]);
    expect(f).toEqual([fresh, mixed]);
    expect(p).toEqual([secondhand]);
  });

  it("keeps a product that somehow holds both new and used offers with the new ones", () => {
    expect(splitByCondition([mixed]).preOwned).toEqual([]);
  });

  it("copes with nothing", () => {
    expect(splitByCondition([])).toEqual({ fresh: [], preOwned: [] });
    expect(splitByCondition(undefined)).toEqual({ fresh: [], preOwned: [] });
    expect(splitByCondition([{ productName: "No offers" }]).fresh).toHaveLength(1);
  });
});

describe("conditionNotice", () => {
  it("is null when every offer is new", () => {
    expect(conditionNotice([offer("n1", "mega", 1)])).toBeNull();
    expect(conditionNotice([])).toBeNull();
    expect(conditionNotice(undefined)).toBeNull();
  });

  it("names the condition when all the offers share it, and says they are compared only with each other", () => {
    expect(conditionNotice([used("u1", "mega", 1), used("u2", "telemart", 2)])).toMatch(/^These offers are used, not new\. They are compared only with each other, never with new prices\./);
    expect(conditionNotice([offer("r1", "mega", 1, { condition: "refurbished" })])).toMatch(/^These offers are refurbished, not new/);
    expect(conditionNotice([offer("o1", "mega", 1, { condition: "open_box" })])).toMatch(/^These offers are open box, not new/);
  });

  it("does not name one condition when they differ", () => {
    expect(conditionNotice([used("u1", "mega", 1), offer("r1", "mega", 1, { condition: "refurbished" })])).toMatch(/^These offers are used, refurbished or open box, not new/);
  });

  it("counts the pre-owned offers inside a product that also has new ones, and says what they are left out of", () => {
    const one = conditionNotice([offer("n1", "mega", 1), used("u1", "mega", 1)]);
    expect(one).toMatch(/^1 offer is used, refurbished or open box, not new\. It is labelled below and left out of the lowest price, the best deal and what you can save\.$/);
    expect(conditionNotice([offer("n1", "mega", 1), used("u1", "mega", 1), used("u2", "telemart", 1)])).toMatch(/^2 offers are used.* They are labelled below/);
  });
});

describe("summarizeOffers with used offers", () => {
  const news = [offer("n1", "priceoye", 64000), offer("n2", "mega", 66000)];
  const secondhand = [used("u1", "telemart", 40000), used("u2", "shophive", 42000)];

  it("never takes the lowest price, the average or the best deal from a used offer", () => {
    const summary = summarizeOffers([...secondhand, ...news]);
    expect(summary.lowest._id).toBe("n1");
    expect(summary.bestDeal._id).not.toMatch(/^u/);
    expect(summary.average).toBe(65000);
    expect(summary.count).toBe(2);
    expect(summary.platformCount).toBe(2);
    expect(summary.excluded).toBe(2);
    expect(summary.preOwnedOnly).toBe(false);
  });

  it("uses the pre-owned offers when there is nothing new, and says so", () => {
    const summary = summarizeOffers(secondhand);
    expect(summary.lowest._id).toBe("u1");
    expect(summary.preOwnedOnly).toBe(true);
    expect(summary.excluded).toBe(0);
    expect(summary.count).toBe(2);
  });

  it("changes nothing for new offers", () => {
    const summary = summarizeOffers(news);
    expect(summary).toMatchObject({ excluded: 0, preOwnedOnly: false, count: 2 });
    expect(summarizeOffers([])).toMatchObject({ excluded: 0, preOwnedOnly: false, count: 0, lowest: null });
  });
});

describe("bestDealOffer with used offers", () => {
  it("never points to a used offer, however well it scores", () => {
    const best = bestDealOffer([used("u1", "telemart", 40000), offer("n1", "priceoye", 64000, { dealScore: 60 }), offer("n2", "mega", 66000, { dealScore: 50 })]);
    expect(best._id).toBe("n1");
  });

  it("is null when only one new offer is left to compare", () => {
    expect(bestDealOffer([used("u1", "telemart", 40000), offer("n1", "priceoye", 64000)])).toBeNull();
  });

  it("still picks among pre-owned offers when there is nothing new", () => {
    expect(bestDealOffer([used("u1", "telemart", 40000, { dealScore: 80 }), used("u2", "mega", 42000, { dealScore: 90 })])._id).toBe("u2");
  });
});

// ---- the results page ----

const A17 = group("Samsung Galaxy A17 256GB", [
  offer("a1", "priceoye", 64000, { dealScore: 92 }), offer("a2", "mega", 65500), offer("a3", "shophive", 66000),
]);
const A17_USED = group("Samsung Galaxy A17 256GB (Used)", [
  used("u1", "telemart", 40000), used("u2", "ishopping", 42000),
]);
const THINKPAD = group("Lenovo ThinkPad Yoga 11E", [
  offer("t1", "ishopping", 27500, { condition: "refurbished", productCategory: "laptop", storageGb: null, ptaStatus: "unknown" }),
  offer("t2", "ishopping", 32500, { condition: "refurbished", productCategory: "laptop", storageGb: null, ptaStatus: "unknown" }),
]);

function serve(groups) {
  vi.mocked(api.searchListings).mockReset().mockResolvedValue({ offers: [], groups, groupCount: groups.length, summary: null });
  vi.mocked(api.getCatalog).mockReset().mockResolvedValue({ groups, total: groups.length, offset: 0, generatedAt: NOW });
}
const renderResults = (path) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Results />} /></Routes></MemoryRouter>);
const titleOf = (article) => within(article).getByRole("heading", { level: 3 }).textContent;

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("Results: used, refurbished and open-box products", () => {
  it("puts them in a labelled section of their own, after the new products, each card marked", async () => {
    serve([A17_USED, A17]); // the used one comes first in the data: it must still come second on screen
    renderResults("/results?q=a17");
    const section = await screen.findByRole("region", { name: /used, refurbished and open box/i });

    expect(within(section).getByRole("heading", { level: 2, name: "Used, refurbished and open box (1)" })).toBeInTheDocument();
    expect(within(section).getAllByRole("article").map(titleOf)).toEqual(["Samsung Galaxy A17 256GB (Used)"]);
    expect(within(within(section).getByRole("article")).getByText("Used")).toBeInTheDocument();
    expect(section).toHaveTextContent(/never compared with new prices/);

    const all = screen.getAllByRole("article").map(titleOf);
    expect(all).toEqual(["Samsung Galaxy A17 256GB", "Samsung Galaxy A17 256GB (Used)"]);
    const newCard = screen.getAllByRole("article")[0];
    expect(within(newCard).queryByText("Used")).toBeNull();
    expect(section.contains(newCard)).toBe(false);
  });

  it("keeps their prices out of the summary: the lowest price is the lowest new price", async () => {
    serve([A17, A17_USED]);
    renderResults("/results?q=a17");
    const cards = await screen.findByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("Lowest price");
    expect(cards).not.toHaveTextContent("Lowest pre-owned price");
    expect(cards).toHaveTextContent("PKR 64,000at PriceOye");
    expect(cards).not.toHaveTextContent("PKR 40,000");
    expect(cards).toHaveTextContent("Stores compared3");
    expect(cards).toHaveTextContent("PKR 65,167"); // (64000 + 65500 + 66000) / 3 = 65,166.7
  });

  it("points to the section from the top of the list, and says the summary leaves them out", async () => {
    serve([A17, A17_USED]);
    renderResults("/results?q=a17");
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(/Also 1 used, refurbished or open-box product, further down/);
    expect(note).toHaveTextContent(/not counted in the summary above/);
    expect(within(note).getByRole("link", { name: "further down" })).toHaveAttribute("href", "#preowned");
    expect(screen.getByRole("region", { name: /used, refurbished and open box/i })).toHaveAttribute("id", "preowned");
  });

  it("shows no section, note or label when every product is new", async () => {
    serve([A17]);
    renderResults("/results?q=a17");
    await screen.findAllByRole("article");
    expect(screen.queryByRole("region", { name: /used, refurbished/i })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Products" })).toBeInTheDocument();
  });

  it("when there is nothing new, shows just the section and a summary that says it is for pre-owned offers", async () => {
    serve([THINKPAD]);
    renderResults("/results?q=thinkpad");
    const section = await screen.findByRole("region", { name: /used, refurbished and open box/i });
    expect(within(section).getByText("Refurbished")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Products" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    const cards = screen.getByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("Lowest pre-owned price");
    expect(cards).toHaveTextContent("PKR 27,500");
  });

  it("drops the section when the filters leave none of them in view", async () => {
    serve([A17, A17_USED]);
    renderResults("/results?q=a17&platforms=priceoye");
    await screen.findAllByRole("article");
    expect(screen.queryByRole("region", { name: /used, refurbished/i })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("has no accessibility violations (structure and names)", async () => {
    serve([A17, A17_USED]);
    const { container } = renderResults("/results?q=a17");
    await screen.findByRole("region", { name: /used, refurbished and open box/i });
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

// ---- the product page ----

function renderProduct(offers, current = offers[0]) {
  vi.mocked(api.getListing).mockReset().mockResolvedValue({ listing: current, offers, summary: null, productGroup: null });
  return render(
    <MemoryRouter initialEntries={["/product/p1"]}>
      <Routes><Route path="/product/:id" element={<Product />} /></Routes>
    </MemoryRouter>
  );
}
const offersTable = () => screen.getByRole("table", { name: /^offers for/i });

describe("Product page: a product that is used", () => {
  it("labels it, says it is compared only with its own kind, and marks every offer", async () => {
    renderProduct([used("u1", "telemart", 40000), used("u2", "ishopping", 42000)]);
    const card = (await screen.findByRole("article"));
    expect(within(card).getAllByText("Used").length).toBeGreaterThanOrEqual(3); // the header badge and one per offer
    expect(card).toHaveTextContent(/These offers are used, not new\. They are compared only with each other, never with new prices\./);
    expect(card).toHaveTextContent("Lowest at Telemart");
    const rows = within(offersTable()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(within(row).getByText("Used")).toBeInTheDocument();
  });
});

describe("Product page: a stray used offer among new ones", () => {
  const offers = [
    offer("n1", "priceoye", 64000, { dealScore: 60 }), offer("n2", "mega", 66000, { dealScore: 50 }),
    used("u1", "telemart", 30000),
  ];

  it("labels it, and keeps it out of the lowest price, the best deal and what you can save", async () => {
    renderProduct(offers);
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("Lowest at PriceOye");
    expect(card).toHaveTextContent("you can save up to PKR 2,000"); // 66,000 - 64,000, not 66,000 - 30,000
    expect(card).toHaveTextContent(/1 offer is used, refurbished or open box, not new\. It is labelled below and left out of the lowest price, the best deal and what you can save\./);

    const rows = within(offersTable()).getAllByRole("row").slice(1);
    const usedRow = rows.find((row) => row.textContent.includes("PKR 30,000"));
    expect(within(usedRow).getByText("Used")).toBeInTheDocument();
    expect(usedRow).not.toHaveClass("is-lowest");
    expect(usedRow).not.toHaveTextContent("Best deal");
    expect(rows.find((row) => row.textContent.includes("PKR 64,000"))).toHaveClass("is-lowest");
  });

  it("leaves it out of the lowest and highest price in the cross-store summary", async () => {
    renderProduct(offers);
    const summary = await screen.findByRole("heading", { name: "Across stores" });
    const text = summary.closest("section").textContent;
    expect(text).toContain("PKR 64,000");
    expect(text).toContain("PKR 66,000");
    expect(text).not.toContain("PKR 30,000");
  });
});

describe("Product page: a pre-owned offer priced above the new ones", () => {
  it("does not set the highest price either", async () => {
    renderProduct([offer("n1", "priceoye", 64000), offer("n2", "mega", 66000), offer("o1", "paklap", 99000, { condition: "open_box" })]);
    const summary = await screen.findByRole("heading", { name: "Across stores" });
    const text = summary.closest("section").textContent;
    expect(text).toContain("PKR 66,000");
    expect(text).not.toContain("PKR 99,000");
    expect(text).toContain("PKR 2,000"); // you can save: 66,000 - 64,000
  });
});

describe("Product page: new offers only", () => {
  it("shows no condition label or notice", async () => {
    renderProduct([offer("n1", "priceoye", 64000), offer("n2", "mega", 66000)]);
    const card = await screen.findByRole("article");
    expect(card).not.toHaveTextContent(/not new/);
    expect(within(card).queryByText("Used")).toBeNull();
    expect(within(card).queryByText("Refurbished")).toBeNull();
  });
});
