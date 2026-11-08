// "Deals we didn't show you" on the home page (2026-11-07): a caught discount, with the evidence against it in our numbers.
import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CaughtCard from "../src/components/CaughtCard.jsx";
import ProofCard from "../src/components/ProofCard.jsx";
import { useCountUp } from "../src/hooks/useCountUp.js";
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

// The home page hero's proof card (2026-11-08): the same caught discounts, one at a time, with our records beside the claim.
describe("ProofCard", () => {
  const second = { ...ITEM, id: "6ae0f7248f02f5f389fc1ab9", title: "Haier HDF-285IG", productName: "Haier Deep Freezer HDF-285IG", price: 81500, originalPrice: 899000, claimedPercent: 91, lowestElsewhere: null };
  const success = (examples) => ({ status: "success", data: { counts: {}, examples } });
  const card = (caught) => render(<MemoryRouter><ProofCard caught={caught} /></MemoryRouter>);

  it("takes a claim apart: the store's 'was' price struck, the verdict, and our records in figures", () => {
    card(success([ITEM]));
    const proof = screen.getByRole("complementary", { name: /a discount our checks caught/i });
    expect(within(proof).getByText("PKR 749,999").tagName).toBe("S");
    expect(within(proof).getByText("Fake 92% off")).toBeInTheDocument();
    const facts = within(proof).getAllByRole("term").map((dt) => `${dt.textContent}: ${dt.nextElementSibling.textContent}`);
    expect(facts).toEqual([
      "Highest we recorded, 5 checks: PKR 59,999", "Highest at 3 other stores: PKR 74,999", "Lowest elsewhere: PKR 58,899",
    ]);
    expect(within(proof).getByRole("link", { name: /Redmi Note 13 Pro/ })).toHaveAttribute("href", "/product/redmi-note-13-pro-8gb-256gb-6ac9259c318b2b4c86a8a7b0");
    expect(within(proof).queryByRole("group", { name: "Examples" })).toBeNull(); // one example: nothing to choose
  });

  it("lets the shopper pick another example, and leaves out a figure it does not have", () => {
    card(success([ITEM, second]));
    const dots = within(screen.getByRole("group", { name: "Examples" })).getAllByRole("button");
    expect(dots.map((dot) => dot.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    fireEvent.click(dots[1]);
    expect(screen.getByText("PKR 899,000")).toBeInTheDocument();
    expect(screen.queryByText("Lowest elsewhere")).toBeNull();
    expect(dots[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("holds its place while loading, and shows nothing without examples or on an error", () => {
    const { container, unmount } = card({ status: "loading" });
    expect(container.querySelector(".proof--loading")).toBeInTheDocument();
    unmount();
    expect(card(success([])).container).toBeEmptyDOMElement();
    expect(card({ status: "error" }).container).toBeEmptyDOMElement();
  });
});

describe("useCountUp", () => {
  const Show = ({ value }) => <span>{useCountUp(value)}</span>;
  afterEach(() => vi.unstubAllGlobals());

  it("shows the value straight away when motion is reduced (or cannot be asked about)", () => {
    vi.stubGlobal("matchMedia", (query) => ({ matches: query.includes("reduce"), media: query }));
    render(<Show value={1524} />);
    expect(screen.getByText("1524")).toBeInTheDocument();
  });

  it("counts up to the value when motion is allowed", async () => {
    vi.stubGlobal("matchMedia", (query) => ({ matches: false, media: query }));
    // each frame arrives half the count's 900 ms after the start, so it ends on the second frame whatever the machine's load
    const start = performance.now();
    let frame = 0;
    vi.stubGlobal("requestAnimationFrame", (tick) => setTimeout(() => tick(start + 450 * ++frame), 0));
    render(<Show value={1524} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(await screen.findByText(/^1[0-4]\d\d$/)).toBeInTheDocument(); // part way
    expect(await screen.findByText("1524")).toBeInTheDocument();
  });
});

describe("evidenceOf", () => {
  it("says only what was checked, in the singular where it is one", () => {
    expect(evidenceOf({ history: { highest: 1649, checks: 10 }, market: null })).toEqual(["In 10 price checks we never saw it above PKR 1,649."]);
    expect(evidenceOf({ history: null, market: { highest: 1999, stores: 1 } })).toEqual(["1 other store charges at most PKR 1,999."]);
    expect(evidenceOf({ history: { highest: 0 }, market: null })).toEqual([]);
  });
});
