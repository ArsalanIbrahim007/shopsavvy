import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getStats: vi.fn(async () => ({ products: 10, platforms: 7, categories: [] })),
  getDeals: vi.fn(async () => ({ deals: [], generatedAt: null, maxAgeHours: 72 })),
  getCatalog: vi.fn(async () => ({ groups: [], total: 0, offset: 0, generatedAt: null })),
  createAlert: vi.fn(),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import { formatBrand, formatDate } from "../src/lib/format.js";
import { suggestedTarget, validateAlert } from "../src/lib/alertForm.js";
import StoreLogo, { StoreMark } from "../src/components/StoreLogo.jsx";
import ScoreCell from "../src/components/results/ScoreCell.jsx";
import Sparkline from "../src/components/results/Sparkline.jsx";
import OfferTable from "../src/components/results/OfferTable.jsx";
import DealVerdict from "../src/components/product/DealVerdict.jsx";
import PriceHistoryChart from "../src/components/product/PriceHistoryChart.jsx";
import AlertForm from "../src/components/product/AlertForm.jsx";
import Specifications from "../src/components/product/Specifications.jsx";
import CrossStoreSummary from "../src/components/product/CrossStoreSummary.jsx";
import ProductCard from "../src/components/ProductCard.jsx";
import SearchBox from "../src/components/SearchBox.jsx";
import Home from "../src/pages/Home.jsx";

const DAY = 24 * 3600 * 1000;
const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();
const point = (price, days) => ({ price, recordedAt: daysAgo(days) });
const inRouter = (ui, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Phone", productCategory: "smartphone", inStock: true, lastScrapedAt: new Date().toISOString(),
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const scored = (over = {}) => ({
  dealScore: 82.5, scoreBreakdown: { price: 50, trust: 18, freshness: 9, availability: 5.5 }, scoreWeights: { price: 60, trust: 20, freshness: 10, availability: 10 }, ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("formatBrand", () => {
  it("capitalises brands, and upper-cases short ones as acronyms", () => {
    expect(formatBrand("apple")).toBe("Apple");
    expect(formatBrand("samsung")).toBe("Samsung");
    expect(formatBrand("hp")).toBe("HP");
    expect(formatBrand("tcl")).toBe("TCL");
    expect(formatBrand("one plus")).toBe("One Plus");
    expect(formatBrand("  xiaomi ")).toBe("Xiaomi");
    expect(formatBrand("")).toBe("");
    expect(formatBrand(undefined)).toBe("");
  });
});

describe("StoreLogo", () => {
  it("shows a monogram badge in the store's colour with the store's name as text", () => {
    const { container } = render(<StoreLogo platform="priceoye" />);
    expect(screen.getByText("PriceOye")).toBeInTheDocument();
    const mark = container.querySelector(".store-mark");
    expect(mark).toHaveTextContent("P");
    expect(mark).toHaveAttribute("aria-hidden", "true"); // decorative: the name is the label
    expect(mark.style.background).not.toBe("");
  });

  it("gives different stores different badges, and an unknown store a neutral one", () => {
    const { container } = render(<><StoreMark platform="mega" /><StoreMark platform="telemart" /><StoreMark platform="brand new store" /></>);
    const marks = [...container.querySelectorAll(".store-mark")];
    expect(marks.map((m) => m.textContent)).toEqual(["M", "T", "B"]);
    expect(marks[0].style.background).not.toBe(marks[1].style.background);
  });

  it("never requests an image from a store's own site", () => {
    const { container } = render(<StoreLogo platform="shophive" />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ScoreCell", () => {
  it("shows the score to one decimal with a coloured band", () => {
    const { rerender } = render(<ScoreCell offer={scored({ dealScore: 92 })} />);
    expect(screen.getByText("92.0")).toHaveClass("score-high");
    rerender(<ScoreCell offer={scored({ dealScore: 60 })} />);
    expect(screen.getByText("60.0")).toHaveClass("score-mid");
    rerender(<ScoreCell offer={scored({ dealScore: 30 })} />);
    expect(screen.getByText("30.0")).toHaveClass("score-low");
  });

  it("explains how the score was worked out, with each part and the total, for hover and keyboard users", () => {
    render(<ScoreCell offer={scored()} />);
    const cell = screen.getByText("82.5").closest(".score-cell");
    expect(cell).toHaveAttribute("tabindex", "0"); // focusable, so a keyboard or touch user gets the explanation too
    const tip = screen.getByRole("tooltip");
    expect(cell).toHaveAttribute("aria-describedby", tip.id);
    expect(tip).toHaveTextContent("Price competitiveness50.0 / 60");
    expect(tip).toHaveTextContent("Store trust18.0 / 20");
    expect(tip).toHaveTextContent("Data freshness9.0 / 10");
    expect(tip).toHaveTextContent("Availability5.5 / 10");
    expect(tip).toHaveTextContent("Total82.5 / 100");
  });

  it("says 'Not scored' without a score, and offers no empty breakdown without one", () => {
    const { rerender } = render(<ScoreCell offer={{}} />);
    expect(screen.getByText("Not scored")).toBeInTheDocument();
    rerender(<ScoreCell offer={{ dealScore: 50 }} />);
    expect(screen.getByText("50.0")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("Sparkline", () => {
  it("draws the direction and size of the change once there are two prices", () => {
    const { container } = render(<Sparkline offer={{ priceHistory: [point(100, 10), point(90, 5), point(80, 1)] }} />);
    expect(container.querySelector(".sparkline")).toHaveClass("sparkline--down");
    expect(screen.getByText(/↓ 20% since first seen/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".sparkline")).toHaveAttribute("title", "3 recorded prices, low 80, high 100");
  });

  it("says tracking has started instead of drawing a line from one point or none", () => {
    const { rerender } = render(<Sparkline offer={{ priceHistory: [point(100, 1)] }} />);
    expect(screen.getByText("Tracking started")).toBeInTheDocument();
    rerender(<Sparkline offer={{}} />);
    expect(screen.getByText("Tracking started")).toBeInTheDocument();
  });

  it("marks a rise and an unchanged price differently", () => {
    const { container, rerender } = render(<Sparkline offer={{ priceHistory: [point(80, 10), point(100, 1)] }} />);
    expect(container.querySelector(".sparkline")).toHaveClass("sparkline--up");
    rerender(<Sparkline offer={{ priceHistory: [point(80, 10), point(80, 1)] }} />);
    expect(container.querySelector(".sparkline")).toHaveClass("sparkline--flat");
  });
});

describe("OfferTable: scores, verdicts and best deal", () => {
  const offers = [
    offer("a", "priceoye", 64000, { ...scored({ dealScore: 88 }), recommendation: { action: "GOOD_DEAL", reason: "cheapest by a margin" }, priceHistory: [point(70000, 20), point(64000, 1)] }),
    offer("b", "mega", 65500, scored({ dealScore: 95 })),
    offer("c", "shophive", 66000, scored({ dealScore: 60 })),
  ];

  it("has a store logo, deal score and verdict column, and marks the cheapest and the best-scoring offers", () => {
    inRouter(<OfferTable offers={offers} name="Phone" />);
    const table = screen.getByRole("table", { name: /offers for phone/i });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent.trim())).toEqual(["Store", "Price", "Discount", "Deal score", "Verdict", "Availability", "Link"]);

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Lowest price");
    expect(rows[0]).not.toHaveTextContent("Best deal");
    expect(rows[1]).toHaveTextContent("Best deal"); // Mega scores highest (95), though it is not the cheapest
    expect(rows[0].querySelector(".store-mark")).not.toBeNull();
    expect(within(rows[0]).getByText("88.0")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Good deal")).toHaveAttribute("title", "cheapest by a margin"); // the server's reason
    expect(within(rows[0]).getByText(/↓ 9% since first seen/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Tracking started")).toBeInTheDocument();
  });

  it("does not crown a best deal when there is only one offer, or when the top score is an unusual price", () => {
    const { unmount } = inRouter(<OfferTable offers={[offers[0]]} name="Phone" />);
    expect(screen.queryByText("Best deal")).toBeNull();
    unmount();

    const odd = [offer("z", "priceoye", 6400, { ...scored({ dealScore: 99 }), priceCheck: { status: "suspect_low", reason: "far below" } }), offers[1], offers[2]];
    inRouter(<OfferTable offers={odd} name="Phone" />);
    const best = screen.getByText("Best deal").closest("tr");
    expect(best).toHaveTextContent("Mega.pk");
  });

  it("explains the score in a footnote", () => {
    inRouter(<OfferTable offers={offers} name="Phone" />);
    expect(screen.getByText(/price \(60\), store trust \(20\), data freshness \(10\) and availability \(10\)/i)).toBeInTheDocument();
  });
});

describe("DealVerdict", () => {
  it("shows the three checks with the server's reason for each", () => {
    render(<DealVerdict listing={{
      recommendation: { action: "BUY_NOW", reason: "Lowest in 90 days." },
      discountAnalysis: { classification: "likely_fake", reason: "Never sold at the claimed price." },
      discountAnomaly: { status: "anomalous", reason: "Above every other store." },
    }} />);
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.closest(".verdict-card"));
    expect(cards[0]).toHaveTextContent(/Should you buy?.*Buy now.*Lowest in 90 days./);
    expect(cards[1]).toHaveTextContent(/Is the discount real?.*Fake discount.*Never sold at the claimed price./);
    expect(cards[2]).toHaveTextContent(/Compared with other stores.*Above market.*Above every other store./);
  });

  it("says so plainly when there is nothing to report, instead of inventing a verdict", () => {
    render(<DealVerdict listing={{}} />);
    expect(screen.getByText(/not enough price history yet/i)).toBeInTheDocument();
    expect(screen.getByText(/does not claim a discount/i)).toBeInTheDocument();
    expect(screen.getByText(/not assessed for this offer/i)).toBeInTheDocument();
  });

  it("shows the quieter outcomes too", () => {
    render(<DealVerdict listing={{ recommendation: { action: "WAIT", reason: "Price is falling." }, discountAnalysis: { classification: "genuine_discount", reason: "Matches history." }, discountAnomaly: { status: "not_comparable", reason: "Only one other store." } }} />);
    expect(screen.getByText("Wait")).toBeInTheDocument();
    expect(screen.getByText("Verified discount")).toBeInTheDocument();
    expect(screen.getByText("Not enough stores to compare")).toBeInTheDocument();
  });
});

describe("PriceHistoryChart", () => {
  const offers = [
    offer("a", "priceoye", 64000, { priceHistory: [point(70000, 100), point(68000, 50), point(64000, 3)] }),
    offer("b", "mega", 65500, { priceHistory: [point(72000, 100), point(65500, 10)] }),
    offer("c", "shophive", 66000, { priceHistory: [] }),
  ];
  const chart = (props = {}) => render(<PriceHistoryChart offers={offers} currentId="a" now={NOW} {...props} />);

  it("draws every store's step line on one chart, the opened listing thicker, with an accessible description", () => {
    const { container } = chart();
    const svg = screen.getByRole("img", { name: "Price history" });
    expect(svg).toHaveAccessibleDescription(/between PKR 64,000 and PKR 72,000/);
    expect(container.querySelectorAll(".history__line")).toHaveLength(2); // the store with no history has no line
    expect(container.querySelectorAll(".history__line--current")).toHaveLength(1);
    expect(container.querySelector(".history__line--current path").getAttribute("d")).toMatch(/^M[\d.,-]+ H/); // steps, not slopes
  });

  it("summarises the opened listing: lowest, highest and the change over its recorded prices", () => {
    chart();
    const stats = screen.getByText(/the listing you opened/i).closest("p");
    expect(stats).toHaveTextContent("PriceOye, the listing you opened:");
    expect(stats).toHaveTextContent("lowest PKR 64,000");
    expect(stats).toHaveTextContent("highest PKR 70,000");
    expect(stats).toHaveTextContent("change -9% over 3 recorded prices");
  });

  it("switches range: 30 days keeps the price that still held when the window began, not the older ones", () => {
    const { container } = chart();
    expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
    const bothLines = () => container.querySelectorAll(".history__line").length;
    expect(bothLines()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    // PriceOye's 70,000 (100 days ago) is gone; its 68,000 held at the window's start and is kept. Mega's 72,000 held then too.
    expect(screen.getByRole("img", { name: "Price history" })).toHaveAccessibleDescription(/between PKR 64,000 and PKR 72,000/);
    // the chart now starts 30 days ago, not 90 or 100
    expect(screen.getByRole("img", { name: "Price history" })).toHaveAccessibleDescription(new RegExp(`from ${formatDate(new Date(NOW - 30 * DAY))} to`));
    expect(bothLines()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(screen.getByRole("img", { name: "Price history" })).toHaveAccessibleDescription(new RegExp(`from ${formatDate(new Date(NOW - 100 * DAY))} to`));
    expect(screen.getByRole("img", { name: "Price history" })).toHaveAccessibleDescription(/between PKR 64,000 and PKR 72,000/);
  });

  it("lets a store's lines be hidden and shown again", () => {
    const { container } = chart();
    const mega = screen.getByRole("button", { name: /mega\.pk/i });
    fireEvent.click(mega);
    expect(mega).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelectorAll(".history__line")).toHaveLength(1);
    fireEvent.click(mega);
    expect(container.querySelectorAll(".history__line")).toHaveLength(2);
  });

  it("offers the recorded prices as a table, newest first", () => {
    chart();
    const details = screen.getByText("Show the recorded prices").closest("details");
    const rows = within(details).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.lastChild.textContent)).toEqual(["PKR 64,000", "PKR 68,000", "PKR 70,000"]);
  });

  it("says what is going on instead of drawing a misleading chart: one day of history, none, or too little in the range", () => {
    const { unmount } = render(<PriceHistoryChart offers={[offer("a", "priceoye", 64000, { priceHistory: [point(64000, 0)] })]} currentId="a" now={NOW} />);
    expect(screen.getByText(/tracking began .* a chart appears once prices have been recorded on more than one day/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    unmount();

    const none = render(<PriceHistoryChart offers={[offer("a", "priceoye", 64000)]} currentId="a" now={NOW} />);
    expect(screen.getByText(/no price history has been recorded/i)).toBeInTheDocument();
    none.unmount();

    render(<PriceHistoryChart offers={[offer("a", "priceoye", 64000, { priceHistory: [point(70000, 200), point(64000, 150)] })]} currentId="a" now={NOW} />);
    expect(screen.getByText(/not enough history in this period/i)).toBeInTheDocument();
  });

  it("hides the store switches when only one store has history", () => {
    render(<PriceHistoryChart offers={[offers[0]]} currentId="a" now={NOW} />);
    expect(screen.queryByRole("group", { name: /stores shown/i })).toBeNull();
  });
});

describe("alert form rules", () => {
  it("suggests about 5% below the price, to the nearest 100, and nothing for a bad price", () => {
    expect(suggestedTarget(375000)).toBe(356200);
    expect(suggestedTarget(64299)).toBe(61000);
    for (const bad of [0, -5, NaN, undefined, "x", 50]) expect(suggestedTarget(bad), String(bad)).toBe("");
  });

  it("checks the email and a target below the current price", () => {
    expect(validateAlert({ email: "a@b.co", target: "50000" }, 60000)).toEqual({});
    expect(validateAlert({ email: "nope", target: "50000" }, 60000).email).toMatch(/valid email/);
    for (const email of ["", "  ", "a@b", "a b@c.de", undefined]) expect(validateAlert({ email, target: "1" }, 60000).email, String(email)).toBeTruthy();
    for (const target of ["", "0", "-5", "abc", undefined]) expect(validateAlert({ email: "a@b.co", target }, 60000).target, String(target)).toMatch(/above zero/);
    expect(validateAlert({ email: "a@b.co", target: "60000" }, 60000).target).toMatch(/below the current price \(PKR 60,000\)/);
    expect(validateAlert({ email: "a@b.co", target: 70000 }, 60000).target).toBeTruthy();
  });
});

describe("AlertForm", () => {
  const listing = { _id: "L1", price: 64299 };
  const fill = (email, target) => {
    fireEvent.change(screen.getByLabelText("Your email"), { target: { value: email } });
    if (target !== undefined) fireEvent.change(screen.getByLabelText(/alert me at or below/i), { target: { value: target } });
  };

  it("starts with a target about 5% below the price", () => {
    render(<AlertForm listing={listing} />);
    expect(screen.getByLabelText(/alert me at or below/i)).toHaveValue(61000);
  });

  it("shows a message next to each invalid field and sends nothing", () => {
    render(<AlertForm listing={listing} />);
    fill("not-an-email", "70000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText(/target must be below the current price/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Your email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Your email")).toHaveAccessibleDescription("Enter a valid email address.");
    expect(api.createAlert).not.toHaveBeenCalled();

    fill("a@b.co", "60000"); // editing clears that field's message
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
  });

  it("sends the listing id, the trimmed email and the target as a number, and shows the server's own words", async () => {
    vi.mocked(api.createAlert).mockResolvedValue({ alert: { _id: "A1", status: "pending" }, message: "Check your email: we sent a link to confirm this alert.", confirmationRequired: true, confirmationSent: true });
    render(<AlertForm listing={listing} />);
    fill("  shopper@example.com ", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("One more step");
    expect(screen.getByRole("status")).toHaveTextContent("Check your email: we sent a link to confirm this alert.");
    expect(screen.getByRole("status")).toHaveTextContent("PKR 60,000 or lower");
    expect(api.createAlert).toHaveBeenCalledWith({ listingId: "L1", email: "shopper@example.com", targetPrice: 60000 });
  });

  it("does not claim an alert is live when the server could not send the confirmation", async () => {
    vi.mocked(api.createAlert).mockResolvedValue({ alert: { status: "pending" }, message: "Alert saved but not active yet. It has to be confirmed from an email link, and this server cannot send email at the moment.", confirmationRequired: true, confirmationSent: false });
    render(<AlertForm listing={listing} />);
    fill("a@b.co", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    const done = await screen.findByRole("status");
    expect(done).toHaveTextContent(/cannot send email/);
    expect(done).toHaveTextContent("One more step");
    expect(done).not.toHaveTextContent("Alert set");
  });

  it("says 'Alert set' only when no confirmation was needed, and lets another alert be made", async () => {
    vi.mocked(api.createAlert).mockResolvedValue({ alert: { status: "active" }, message: "Alert created.", confirmationRequired: false, confirmationSent: false });
    render(<AlertForm listing={listing} />);
    fill("a@b.co", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    expect(await screen.findByText("Alert set")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /set another alert/i }));
    expect(screen.getByLabelText("Your email")).toBeInTheDocument(); // the form is back, ready for another target
  });

  it("puts the server's field errors next to their fields", async () => {
    vi.mocked(api.createAlert).mockRejectedValue(new ApiError({ status: 400, code: "VALIDATION_ERROR", details: [{ path: "email", msg: "email must be a valid email address" }, { path: "targetPrice", msg: "targetPrice must be greater than zero" }], requestId: "r-1" }));
    render(<AlertForm listing={listing} />);
    fill("a@b.co", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    expect(await screen.findByText("email must be a valid email address")).toBeInTheDocument();
    expect(screen.getByText("targetPrice must be greater than zero")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Reference: r-1");
  });

  it("shows the server's limit message (for example too many alerts waiting) and keeps what was typed", async () => {
    vi.mocked(api.createAlert).mockRejectedValue(new ApiError({ status: 429, code: "RATE_LIMITED", message: "This address has alerts waiting to be confirmed." }));
    render(<AlertForm listing={listing} />);
    fill("a@b.co", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This address has alerts waiting to be confirmed.");
    expect(screen.getByLabelText("Your email")).toHaveValue("a@b.co");
  });

  it("disables the button while sending, so a double click sends one request", async () => {
    let resolve;
    vi.mocked(api.createAlert).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AlertForm listing={listing} />);
    fill("a@b.co", "60000");
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    const button = await screen.findByRole("button", { name: /setting the alert/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(api.createAlert).toHaveBeenCalledTimes(1);
    resolve({ alert: {}, message: "ok", confirmationRequired: false });
    await screen.findByText("Alert set");
  });
});

describe("Specifications and CrossStoreSummary", () => {
  it("lists what is known with readable values, and says where it comes from", () => {
    render(<Specifications listing={{ brand: "apple", productCategory: "smartphone", storageGb: 256, condition: "new", ptaStatus: "non_pta" }} />);
    const rows = screen.getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual(["BrandApple", "CategorySmartphones", "Storage256 GB", "ConditionNew", "PTA statusNon-PTA"]);
    expect(screen.getByText(/derived from the product title/i)).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to list", () => {
    const { container } = render(<Specifications listing={{ productCategory: "other", ptaStatus: "unknown" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("summarises across stores: count, lowest, highest, saving, best deal", () => {
    render(<CrossStoreSummary offers={[offer("a", "priceoye", 64000, { dealScore: 80 }), offer("b", "mega", 67000, { dealScore: 90 }), offer("c", "shophive", 70000, { dealScore: 50 })]} />);
    const text = document.querySelector(".summary").textContent;
    expect(text).toContain("Stores compared3");
    expect(text).toContain("Lowest pricePKR 64,000");
    expect(text).toContain("Highest pricePKR 70,000");
    expect(text).toContain("You can savePKR 6,000");
    expect(text).toContain("Best dealMega.pk");
  });

  it("does not let an unusual price set the lowest, the highest or the saving, and has no best deal for one offer", () => {
    const { unmount } = render(<CrossStoreSummary offers={[offer("a", "priceoye", 100, { priceCheck: { status: "suspect_low" } }), offer("b", "mega", 65000), offer("c", "shophive", 66000)]} />);
    const text = document.querySelector(".summary").textContent;
    expect(text).toContain("Lowest pricePKR 65,000");
    expect(text).toContain("You can savePKR 1,000");
    unmount();

    // a price far ABOVE the others is an error too: it must not become the highest price or inflate the saving
    const high = render(<CrossStoreSummary offers={[offer("a", "priceoye", 900000, { priceCheck: { status: "suspect_high" } }), offer("b", "mega", 65000), offer("c", "shophive", 66000)]} />);
    const highText = document.querySelector(".summary").textContent;
    expect(highText).toContain("Highest pricePKR 66,000");
    expect(highText).toContain("You can savePKR 1,000");
    high.unmount();

    render(<CrossStoreSummary offers={[offer("a", "priceoye", 64000)]} />);
    const single = document.querySelector(".summary").textContent;
    expect(single).not.toContain("You can save");
    expect(single).toContain("Best deal—");
  });
});

describe("ProductCard shows the deal score and the store", () => {
  it("shows the best offer's score out of 100 and the store's badge and name", () => {
    const { container } = inRouter(<ProductCard group={{ productName: "Samsung Galaxy A17", offers: [offer("a", "priceoye", 64000, { dealScore: 91.6 }), offer("b", "mega", 65000)] }} />);
    expect(screen.getByText("Score 92")).toHaveAttribute("title", expect.stringMatching(/out of 100/));
    expect(container.querySelector(".product-card__store")).toHaveTextContent("PriceOye");
    expect(container.querySelector(".product-card__store .store-mark")).not.toBeNull();
  });

  it("shows no score for an offer without one", () => {
    inRouter(<ProductCard group={{ productName: "Phone", offers: [offer("a", "priceoye", 64000, { dealScore: undefined })] }} />);
    expect(screen.queryByText(/^Score/)).toBeNull();
  });
});

describe("recent searches", () => {
  const Where = () => <p data-testid="where">{decodeURIComponent(useLocation().pathname + useLocation().search)}</p>;
  const page = (ui) => render(
    <MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>
  );

  it("records a search when it is made", () => {
    page(<SearchBox />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "  iphone 17  " } });
    fireEvent.submit(screen.getByRole("combobox").closest("form"));
    expect(JSON.parse(window.localStorage.getItem("shopsavvy:recent-searches:v1"))).toEqual(["iphone 17"]);
  });

  it("does not record an empty search", () => {
    page(<SearchBox />);
    fireEvent.submit(screen.getByRole("combobox").closest("form"));
    expect(window.localStorage.getItem("shopsavvy:recent-searches:v1")).toBeNull();
  });

  it("shows them on the home page, newest first, each a link to that search, and clears them on request", async () => {
    window.localStorage.setItem("shopsavvy:recent-searches:v1", JSON.stringify(["macbook air", "galaxy a17"]));
    page(<Home />);
    const recent = screen.getByLabelText("Your recent searches");
    const links = within(recent).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["macbook air", "galaxy a17"]);
    expect(links[0]).toHaveAttribute("href", "/results?q=macbook%20air");

    fireEvent.click(within(recent).getByRole("button", { name: "Clear" }));
    expect(screen.queryByLabelText("Your recent searches")).toBeNull();
    expect(window.localStorage.getItem("shopsavvy:recent-searches:v1")).toBeNull();
    await waitFor(() => expect(api.getStats).toHaveBeenCalled());
  });

  it("shows no 'Recent' row when there are none", async () => {
    page(<Home />);
    expect(screen.queryByLabelText("Your recent searches")).toBeNull();
    await waitFor(() => expect(api.getStats).toHaveBeenCalled());
  });
});
