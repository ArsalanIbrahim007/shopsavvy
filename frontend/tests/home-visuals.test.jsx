// The home page's pictures (2026-11-08): category icons, "How we check prices" shown as three small drawings.
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CategoryIcon from "../src/components/CategoryIcon.jsx";
import HowWeCheck from "../src/components/HowWeCheck.jsx";
import { FEATURED_CATEGORIES } from "../src/lib/categories.js";

describe("CategoryIcon", () => {
  it("has a drawing for every category with a home page tile, with an amber detail, hidden from screen readers", () => {
    for (const category of FEATURED_CATEGORIES) {
      const { container, unmount } = render(<CategoryIcon category={category} />);
      const svg = container.querySelector("svg");
      expect(svg, category).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg.querySelector(".ci-accent"), category).not.toBeNull();
      unmount();
    }
  });

  it("draws nothing for a category it does not know", () => {
    expect(render(<CategoryIcon category="toaster" />).container).toBeEmptyDOMElement();
  });
});

describe("HowWeCheck", () => {
  it("names the three checks with one short line each, and keeps the drawings out of the reading order", () => {
    const { container } = render(<MemoryRouter><HowWeCheck /></MemoryRouter>);
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps.map((step) => within(step).getByRole("heading", { level: 3 }).textContent)).toEqual(["Matched", "Checked", "Flagged"]);
    for (const step of steps) expect(step.querySelector("p").textContent.split(" ").length).toBeLessThanOrEqual(9);
    expect(container.querySelectorAll(".check-pic")).toHaveLength(3);
    for (const pic of container.querySelectorAll(".check-pic")) expect(pic).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Read the details" })).toHaveAttribute("href", "/how-it-works");
  });
});
