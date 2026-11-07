// "Deals we didn't show you" on the home page (2026-11-07): a caught discount, with the evidence against it in our numbers.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CaughtCard from "../src/components/CaughtCard.jsx";
import { evidenceOf } from "../src/lib/caught.js";

const ITEM = {
  id: "6ac9259c318b2b4c86a8a7b0", title: "Redmi Note 13 Pro 8GB-256GB", productName: "Redmi Note 13 Pro (8GB-256GB)",
  platform: "xcessorieshub", imageUrl: "", price: 59999, originalPrice: 749999, claimedPercent: 92,
  caught: { fake: true, aboveMarket: true, unusual: false },
  history: { highest: 59999, checks: 5 }, market: { highest: 74999, stores: 3 }, lowestElsewhere: 58899,
};

describe("CaughtCard", () => {
  it("shows the claim struck through, the verdicts, and the evidence, and links to the product page", () => {
    render(<MemoryRouter><CaughtCard item={ITEM} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Redmi Note 13 Pro (8GB-256GB)" }).closest("a")).toHaveAttribute("href", "/product/redmi-note-13-pro-8gb-256gb-6ac9259c318b2b4c86a8a7b0");
    expect(screen.getByText("PKR 749,999").tagName).toBe("S");
    expect(screen.getByText("Fake 92% off")).toBeInTheDocument();
    expect(screen.getByText("Above every other store")).toBeInTheDocument();
    expect(screen.getByText("In 5 price checks we never saw it above PKR 59,999.")).toBeInTheDocument();
    expect(screen.getByText("3 other stores charge at most PKR 74,999.")).toBeInTheDocument();
  });
});

describe("evidenceOf", () => {
  it("says only what was checked, in the singular where it is one", () => {
    expect(evidenceOf({ history: { highest: 1649, checks: 10 }, market: null })).toEqual(["In 10 price checks we never saw it above PKR 1,649."]);
    expect(evidenceOf({ history: null, market: { highest: 1999, stores: 1 } })).toEqual(["1 other store charges at most PKR 1,999."]);
    expect(evidenceOf({ history: { highest: 0 }, market: null })).toEqual([]);
  });
});
