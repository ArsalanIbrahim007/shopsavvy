// The home page's pictures (2026-11-08): category icons, "How we check prices" shown as three small drawings.
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CategoryIcon from "../src/components/CategoryIcon.jsx";
import CategoryMenu from "../src/components/CategoryMenu.jsx";
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

// The header's Categories menu (2026-11-08) replaced the Phones, Laptops and TVs links: every category, one panel.
describe("CategoryMenu", () => {
  const menu = (current = "", at = "/") => render(<MemoryRouter initialEntries={[at]}><CategoryMenu current={current} /></MemoryRouter>);

  it("opens a panel with every category, each linking to its results, and closes on Escape", () => {
    menu();
    const button = screen.getByRole("button", { name: "Categories" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(FEATURED_CATEGORIES.map((c) => `/results?category=${c}`));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("names the category being browsed on the button and marks it in the panel", () => {
    menu("tv", "/results?category=tv");
    const button = screen.getByRole("button", { name: "TVs" });
    expect(button).toHaveAttribute("aria-current", "page");
    fireEvent.click(button);
    expect(screen.getByRole("link", { name: "TVs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Laptops" })).not.toHaveAttribute("aria-current");
  });

  it("closes when a click lands outside it", () => {
    menu();
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole("button", { name: "Categories" })).toHaveAttribute("aria-expanded", "false");
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
