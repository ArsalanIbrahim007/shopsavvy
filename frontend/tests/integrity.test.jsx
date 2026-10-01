import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { daysSince, discountRows, formatScore, formatShare, markupRows, matcherRows, perHundred, ptaRows, share } from "../src/lib/integrity.js";

vi.mock("../src/api/endpoints.js", () => ({ getIntegrity: vi.fn() }));
import { getIntegrity } from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import HonestPrices from "../src/pages/HonestPrices.jsx";

describe("share", () => {
  it("rounds to whole per cent from 10% up and to one decimal below, and is null for nothing", () => {
    expect(share(536, 735)).toBe(73);
    expect(share(4, 735)).toBe(0.5);
    expect(share(53, 735)).toBe(7.2);
    expect(share(1, 10)).toBe(10);
    expect(share(0, 735)).toBe(0);
    expect(share(5, 0)).toBeNull();
    expect(share(5, undefined)).toBeNull();
    expect(share(Number.NaN, 5)).toBeNull();
  });
});

describe("formatting", () => {
  it("shows a score with one decimal, dropping a trailing .0, and n/a for a missing one", () => {
    expect(formatScore(71.4)).toBe("71.4%");
    expect(formatScore(85)).toBe("85%");
    expect(formatScore(0)).toBe("0%");
    expect(formatScore(null)).toBe("n/a");
    expect(formatScore(undefined)).toBe("n/a");
    expect(formatShare(73)).toBe("73%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(null)).toBe("n/a");
    expect(perHundred(71.4)).toBe("about 71 in 100");
    expect(perHundred(34.5)).toBe("about 35 in 100");
    expect(perHundred(null)).toBe("n/a");
  });

  it("counts whole days since a date, at least one, or null", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(daysSince("2026-07-03T00:00:00Z", now)).toBe(90);
    expect(daysSince("2026-10-01T00:00:00Z", now)).toBe(1);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not a date", now)).toBeNull();
  });
});

describe("rows", () => {
  it("lists the five discount results in a fixed order with their shares, even when some are zero", () => {
    const rows = discountRows({ claims: 200, verdicts: { genuine: 20, unverified: 100, likelyFake: 2 } });
    expect(rows.map((r) => r.id)).toEqual(["genuine", "likelyGenuine", "unverified", "suspicious", "likelyFake"]);
    expect(rows.map((r) => r.count)).toEqual([20, 0, 100, 0, 2]);
    expect(rows.map((r) => r.share)).toEqual([10, 0, 50, 0, 1]);
    expect(rows.every((r) => r.hint.length > 15)).toBe(true);
    expect(discountRows(undefined).map((r) => r.count)).toEqual([0, 0, 0, 0, 0]);
    expect(discountRows(undefined)[0].share).toBeNull();
  });

  it("describes the discount results by what the price history says, not what other stores charge", () => {
    const hints = Object.fromEntries(discountRows({ claims: 1, verdicts: {} }).map((r) => [r.id, r.hint]));
    expect(hints.likelyGenuine).not.toMatch(/other stores/i);
    expect(hints.unverified).toMatch(/history/i);
    expect(hints.likelyFake).toMatch(/history/i);
  });

  it("lists the PTA figures with their shares of the phone and tablet offers", () => {
    const rows = ptaRows({ offers: 1000, approved: 400, nonPta: 30, notStated: 100, movedOut: 5 });
    expect(rows.map((r) => [r.id, r.count, r.share])).toEqual([["approved", 400, 40], ["nonPta", 30, 3], ["notStated", 100, 10], ["movedOut", 5, 0.5]]);
    expect(ptaRows(undefined).every((r) => r.count === 0 && r.share === null)).toBe(true);
  });

  it("puts the model in use first, marks only it, and leaves out a model that is missing", () => {
    const models = { rule: { accuracy: 74 }, candidate: { accuracy: 75 }, production: { accuracy: 78 } };
    const rows = matcherRows(models);
    expect(rows.map((r) => r.id)).toEqual(["production", "rule", "candidate"]);
    expect(rows.map((r) => r.inUse)).toEqual([true, false, false]);
    expect(rows[0].accuracy).toBe(78);
    expect(matcherRows({ production: { accuracy: 1 } }).map((r) => r.id)).toEqual(["production"]);
    expect(matcherRows(undefined)).toEqual([]);
  });

  it("orders the mark-up catch rates from the smallest mark-up and drops what is not a number", () => {
    const rows = markupRows({ "2x": 96.8, "1.3x": 9.5, "1.75x": 85, "1.5x": 29.5, "junk": 3, "3x": null });
    expect(rows.map((r) => r.label)).toEqual(["1.3x", "1.5x", "1.75x", "2x"]);
    expect(rows.map((r) => r.caught)).toEqual([9.5, 29.5, 85, 96.8]);
    expect(markupRows(undefined)).toEqual([]);
  });
});

const report = (over = {}) => ({
  generatedAt: new Date().toISOString(),
  live: {
    offers: 3095, stores: 12, products: 2455, productsCompared: 233,
    unusualPrices: { count: 1, examples: [{ platform: "priceoye", title: "Samsung 43 Inch Smart TV", price: 225999, reason: "2.5 times what 2 other stores charge." }] },
    discounts: { claims: 735, verdicts: { genuine: 4, likelyGenuine: 26, suspicious: 116, likelyFake: 53, unverified: 536 }, aboveMarket: 26 },
    pta: { offers: 1750, approved: 399, nonPta: 36, notStated: 117, movedOut: 15, readFromProductPage: 303, productsKeptApart: 31 },
    freshness: { within24h: 2225, within72h: 2945, newestAt: new Date().toISOString() },
    history: { points: 8296, days: 25, since: "2026-07-03T00:00:00Z" },
  },
  evaluation: {
    matcher: {
      generatedAt: "2026-09-29T10:00:00Z", heldOutPairs: 105, trainingPairs: 106,
      models: {
        production: { accuracy: 78.1, precision: 71.4, recall: 34.5, f1: 46.5 },
        candidate: { accuracy: 74.3, precision: 54.2, recall: 44.8, f1: 49.1 },
        rule: { accuracy: 74.3, precision: 58.3, recall: 24.1, f1: 34.1 },
      },
    },
    discount: {
      generatedAt: "2026-09-29T10:00:00Z", judgeableClaims: 251, historyRuleJudged: 14, historyRuleShare: 5.6, splits: 5, flaggedRealClaims: 7,
      caughtInvented: { "1.3x": 9.5, "1.5x": 29.5, "1.75x": 85, "2x": 96.8 },
    },
  },
  ...over,
});

const renderPage = () => render(<MemoryRouter><HonestPrices /></MemoryRouter>);

beforeEach(() => {
  vi.mocked(getIntegrity).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("HonestPrices page", () => {
  it("asks the server once for all three sections", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    await screen.findByText(/Counted from 3,095 offers/);
    expect(getIntegrity).toHaveBeenCalledTimes(1);
  });

  it("shows the counted numbers, with the real unusual price as the example", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    expect(await screen.findByText(/Counted from 3,095 offers for 2,455 products at 12 stores/)).toBeInTheDocument();

    const unusual = screen.getByRole("region", { name: /look like mistakes/i });
    expect(within(unusual).getByText("Samsung 43 Inch Smart TV")).toBeInTheDocument();
    expect(within(unusual).getByText(/PriceOye, PKR 225,999/)).toBeInTheDocument();

    const discounts = screen.getByRole("table", { name: "Discount claims by result" });
    expect(within(discounts).getByRole("row", { name: /Unverified.*536.*73%/ })).toBeInTheDocument();
    expect(within(discounts).getByRole("row", { name: /Likely fake.*53.*7\.2%/ })).toBeInTheDocument();
    expect(within(discounts).getByRole("row", { name: /^All.*735.*100%/ })).toBeInTheDocument();
    expect(screen.getByText(/73% of claims are unverified/)).toBeInTheDocument();
    expect(screen.getByText(/25 days deep \(8,296 price points since 3 Jul 2026\)/)).toBeInTheDocument();

    const pta = screen.getByRole("table", { name: "PTA status of phone and tablet offers" });
    expect(within(pta).getByRole("row", { name: /State PTA approved.*399.*23%/ })).toBeInTheDocument();
    expect(screen.getByText(/31 products are kept apart/)).toBeInTheDocument();
    expect(screen.getByText(/For 303 offers whose title said nothing/)).toBeInTheDocument();

    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText(/95% in the last 3 days/)).toBeInTheDocument();
  });

  it("reports the model in use, not the newer model's better-looking recall, and says what the numbers mean", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    const table = await screen.findByRole("table", { name: /105 labelled pairs/ });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("The model we use")).toBeInTheDocument();
    expect(within(rows[1]).getByText("78.1%")).toBeInTheDocument();
    expect(within(rows[1]).getByText("34.5%")).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /newer model, not in use yet.*74\.3%.*54\.2%.*44\.8%/ })).toBeInTheDocument();
    expect(screen.getByText(/right about 71 in 100 times, and it finds about 35 in 100 of the real matches/)).toBeInTheDocument();
    expect(screen.getByText(/trained on 106 labelled pairs/)).toBeInTheDocument();
  });

  it("shows how much of an invented mark-up the detector catches, including the small ones it mostly misses", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    const table = await screen.findByRole("table", { name: /invented mark-ups the detector caught/ });
    expect(within(table).getByRole("row", { name: /1\.3x the real price.*9\.5%/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /2x the real price.*96\.8%/ })).toBeInTheDocument();
    expect(screen.getByText(/could judge 14 of 251 claims \(5\.6%\)/)).toBeInTheDocument();
    expect(screen.getByText(/It flagged 7% of real claims/)).toBeInTheDocument();
  });

  it("says plainly when nothing is set aside, and never invents an example", async () => {
    const data = report();
    data.live.unusualPrices = { count: 0, examples: [] };
    vi.mocked(getIntegrity).mockResolvedValue(data);
    renderPage();
    const unusual = (await screen.findByRole("region", { name: /look like mistakes/i }));
    expect(within(unusual).getByText("0")).toBeInTheDocument();
    expect(within(unusual).getByText(/None right now/)).toBeInTheDocument();
    expect(within(unusual).getByText(/offers set aside right now/)).toBeInTheDocument();
  });

  it("says one offer, not one offers", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    expect(await screen.findByText("offer set aside right now")).toBeInTheDocument();
  });

  it("shows a skeleton and a patience note while the first count runs, and the explanations are already there", () => {
    vi.mocked(getIntegrity).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/can take about a minute/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What we cannot tell you" })).toBeInTheDocument();
    expect(screen.queryByText(/Counted from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("offers a retry when the numbers cannot be loaded, and does not show figures it does not have", async () => {
    vi.mocked(getIntegrity).mockRejectedValueOnce(new ApiError({ status: 503, code: "SERVICE_UNAVAILABLE", message: "down" }));
    vi.mocked(getIntegrity).mockResolvedValueOnce(report());
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(screen.queryByText(/Counted from/)).not.toBeInTheDocument();
    expect(screen.getByText(/accuracy numbers could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/detector's numbers could not be loaded/)).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/Counted from/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves out only the section whose report is missing", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report({ evaluation: { matcher: null, discount: report().evaluation.discount } }));
    renderPage();
    expect(await screen.findByText(/accuracy numbers could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /invented mark-ups/ })).toBeInTheDocument();
    expect(screen.getByText(/Counted from/)).toBeInTheDocument();
  });

  it("says the live numbers are unavailable rather than showing zeros when the server sends none", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report({ live: null }));
    renderPage();
    expect(await screen.findByText(/live numbers are not available/)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("does not name another price comparison site", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    const { container } = renderPage();
    await screen.findByText(/Counted from/);
    expect(container.textContent).not.toMatch(/qeemat|pricebaba|whatmobile/i);
  });

  it("links to the step-by-step explanation", async () => {
    vi.mocked(getIntegrity).mockResolvedValue(report());
    renderPage();
    expect(await screen.findByRole("link", { name: /step by step/ })).toHaveAttribute("href", "/how-it-works");
  });
});
