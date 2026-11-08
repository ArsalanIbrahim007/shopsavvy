// "Fair price for these specs" (2026-11-08): the trained price model's estimate under a product's lowest price.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import FairPrice from "../src/components/results/FairPrice.jsx";
import { fairPriceGap } from "../src/lib/fairPrice.js";

const fair = { price: 100000, low: 80000, high: 130000, medianError: 0.13 };

describe("fairPriceGap", () => {
  it("says how far a price sits from the fair price, and 'about' within 2%", () => {
    expect(fairPriceGap(90000, fair)).toEqual({ tone: "good", text: "10% below it" });
    expect(fairPriceGap(112000, fair)).toEqual({ tone: "caution", text: "12% above it" });
    expect(fairPriceGap(101000, fair)).toEqual({ tone: "neutral", text: "about the fair price" });
    expect(fairPriceGap(90000, null)).toBeNull();
  });
});

describe("FairPrice", () => {
  it("shows the estimate and the gap, and explains the model's accuracy on hover", () => {
    const { container } = render(<FairPrice price={90000} fair={fair} />);
    expect(container).toHaveTextContent("Fair price for these specs PKR 100,000 · 10% below it");
    expect(container.querySelector(".fair-price").title).toMatch(/within 13% of its estimate half the time/);
  });

  it("shows nothing where the server sent no fair price", () => {
    const { container } = render(<FairPrice price={90000} fair={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/fair price/i)).toBeNull();
  });
});

// Seller and delivery from the marketplaces, under the store's name in the offer table (2026-11-08).
describe("the offer table's seller and delivery line", async () => {
  const { default: OfferTable } = await import("../src/components/results/OfferTable.jsx");
  const { MemoryRouter } = await import("react-router-dom");
  const offer = (id, platform, price, over = {}) => ({ _id: id, platform, price, title: "Redmi Note 15 Pro 256GB", productUrl: `https://${platform}.example/p`, inStock: true, lastScrapedAt: new Date().toISOString(), ...over });

  it("names the seller and the delivery where the store says, and nothing where it does not", () => {
    render(<MemoryRouter><OfferTable name="Redmi Note 15 Pro" offers={[
      offer("a", "alfamall", 95930, { seller: "Authentico", delivery: { window: "10 Nov - 11 Nov, 2026", express: false, freeShipping: true } }),
      offer("b", "mega", 96000),
    ]} /></MemoryRouter>);
    expect(screen.getByText("Sold by Authentico · Delivery 10 Nov–11 Nov · Free shipping")).toBeInTheDocument();
    expect(screen.queryAllByText(/^Sold by/)).toHaveLength(1);
  });
});
