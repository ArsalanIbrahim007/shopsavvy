// The drop forecast's note on the product page (2026-11-07): how much more often such prices dropped, and how rarely that still is.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import DropChance from "../src/components/product/DropChance.jsx";
import { dropChanceText } from "../src/lib/dropChance.js";

const chance = { lift: 7.72, chance: 0.055, share: 0.05 };
const name = (p) => ({ priceoye: "PriceOye", mega: "Mega.pk", shophive: "Shophive" })[p];

describe("dropChanceText", () => {
  it("names the stores, and never promises a drop", () => {
    const text = dropChanceText([{ platform: "priceoye", chance }], name);
    expect(text.lead).toBe("PriceOye's price is among the 5% our forecast ranks most likely to fall 3% or more within a week, from how it has moved so far.");
    expect(text.caveat).toBe("In our test, prices ranked like this dropped 7.7 times as often as others, yet only about 1 in 18 did: a hint for whether to wait, not a promise.");
  });

  it("joins several stores once each", () => {
    const text = dropChanceText(["mega", "priceoye", "mega", "shophive"].map((platform) => ({ platform, chance })), name);
    expect(text.lead).toMatch(/^Mega\.pk, PriceOye and Shophive's prices are among/);
  });

  it("says nothing without a flagged price or its figures", () => {
    expect(dropChanceText([], name)).toBeNull();
    expect(dropChanceText([{ platform: "mega", chance: { lift: 0.8, chance: 0.01, share: 0.05 } }], name)).toBeNull();
  });
});

describe("DropChance", () => {
  it("shows the note only when a price is flagged", () => {
    const { container, rerender } = render(<DropChance chances={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DropChance chances={[{ platform: "priceoye", chance }]} />);
    expect(screen.getByRole("heading", { name: "Higher chance of a price drop this week" })).toBeInTheDocument();
  });
});
