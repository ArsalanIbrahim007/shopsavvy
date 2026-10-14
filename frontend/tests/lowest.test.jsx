import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { lowestFlag } from "../src/lib/outlook.js";
import ProductCard from "../src/components/ProductCard.jsx";

const AT_LOW = { price: 60000, low: 59500, high: 66000, since: "2026-10-01", days: 15, records: 9, strength: "early" };
const offer = (id, platform, price, colour, over = {}) => ({
  _id: id, platform, price, colour, title: "Samsung Galaxy A17 256GB", productCategory: "smartphone", inStock: true, condition: "new",
  ptaStatus: "pta_approved", lastScrapedAt: new Date().toISOString(), productUrl: `https://${platform}.example.com/${id}`, dealScore: 70,
  recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const card = (group) => render(<MemoryRouter><ProductCard group={group} /></MemoryRouter>);

describe("lowestFlag", () => {
  it("makes the badge, saying what the claim rests on", () => {
    const flag = lowestFlag(AT_LOW, 60000);
    expect(flag).toMatchObject({ id: "lowest", tone: "good", label: "Lowest we've recorded" });
    expect(flag.reason).toContain("9 checks over 15 days, since 1 Oct 2026");
    expect(flag.reason).toContain("within 1% of the lowest");
  });

  it("says one check and one day in the singular", () => {
    expect(lowestFlag({ ...AT_LOW, records: 1, days: 1 }, 60000).reason).toContain("1 check over 1 day");
  });

  it("is shown for the price the claim is about (or a lower one), never for a dearer price on the card", () => {
    expect(lowestFlag(AT_LOW, 59000)).not.toBeNull();
    expect(lowestFlag(AT_LOW, 60001)).toBeNull();
  });

  it("gives nothing without a claim or without a usable price", () => {
    for (const [atLow, price] of [[null, 60000], [undefined, 60000], [AT_LOW, 0], [AT_LOW, null], [AT_LOW, "x"]]) expect(lowestFlag(atLow, price)).toBeNull();
  });

  it("leaves out the date when the server sent none it can read", () => {
    expect(lowestFlag({ ...AT_LOW, since: null }, 60000).reason).not.toContain("since");
  });
});

describe("the search result card", () => {
  const offers = [offer("a", "priceoye", 60000, "Black"), offer("b", "mega", 62000, "Blue")];

  it("shows the badge when the server says the product's best price is at its recorded low", () => {
    card({ productName: "Samsung Galaxy A17 256GB", offers, atLow: AT_LOW });
    expect(screen.getByText("Lowest we've recorded")).toBeInTheDocument();
    expect(screen.getByTitle(/9 checks over 15 days/)).toBeInTheDocument();
  });

  it("shows nothing when the server makes no claim", () => {
    card({ productName: "Samsung Galaxy A17 256GB", offers, atLow: null });
    expect(screen.queryByText("Lowest we've recorded")).toBeNull();
  });

  it("hides it when the card shows a dearer offer than the one the claim is about (a filter left the cheapest out)", () => {
    card({ productName: "Samsung Galaxy A17 256GB", offers: [offers[1]], atLow: AT_LOW });
    expect(screen.queryByText("Lowest we've recorded")).toBeNull();
  });
});
