import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";

import { MIN_REVIEWS_TO_SHOW, ratingInfo } from "../src/lib/rating.js";
import OfferTable from "../src/components/results/OfferTable.jsx";

const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Apple iPhone X", productCategory: "smartphone", inStock: true, lastScrapedAt: new Date().toISOString(), condition: "new",
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const row = (name) => screen.getAllByRole("row").find((r) => r.textContent.includes(name));

describe("ratingInfo", () => {
  it("shows the score when it rests on at least five reviews, with the count and a spoken sentence", () => {
    expect(MIN_REVIEWS_TO_SHOW).toBe(5);
    const info = ratingInfo({ platform: "priceoye", rating: 4.9, reviewCount: 295 });
    expect(info).toMatchObject({ value: "4.9", count: 295, countText: "295 reviews", enough: true });
    expect(info.spoken).toBe("Rated 4.9 out of 5 by 295 reviews at PriceOye.");
    expect(info.title).toContain("4.9 out of 5");
  });

  it("the boundary is five: four reviews is too few, five is enough", () => {
    expect(ratingInfo({ platform: "priceoye", rating: 4.5, reviewCount: 4 }).enough).toBe(false);
    expect(ratingInfo({ platform: "priceoye", rating: 4.5, reviewCount: 5 }).enough).toBe(true);
  });

  it("a rating from a single review is not shown as a score: only the count, and the exact figure in the tooltip", () => {
    const info = ratingInfo({ platform: "priceoye", rating: 5, reviewCount: 1 });
    expect(info).toMatchObject({ value: "5.0", countText: "1 review", enough: false });
    expect(info.spoken).toBe("Only 1 review at PriceOye, too few to rate it.");
    expect(info.title).toContain("5.0 out of 5");
    expect(info.title).toContain("too few");
  });

  it("writes whole numbers with one decimal, rounds, and puts a thousands separator in a big count", () => {
    expect(ratingInfo({ platform: "priceoye", rating: 5, reviewCount: 10 }).value).toBe("5.0");
    expect(ratingInfo({ platform: "priceoye", rating: 4.66, reviewCount: 10 }).value).toBe("4.7");
    expect(ratingInfo({ platform: "priceoye", rating: 4, reviewCount: 1204 }).countText).toBe("1,204 reviews");
  });

  it("gives nothing for no rating, a rating of zero or off the scale, or a rating with no usable review count", () => {
    for (const bad of [
      {}, null, undefined, { rating: null, reviewCount: 10 }, { rating: 0, reviewCount: 10 }, { rating: -1, reviewCount: 10 }, { rating: 5.1, reviewCount: 10 },
      { rating: "good", reviewCount: 10 }, { rating: 4.5 }, { rating: 4.5, reviewCount: null }, { rating: 4.5, reviewCount: 0 }, { rating: 4.5, reviewCount: -3 },
      { rating: 4.5, reviewCount: 2.5 }, { rating: 4.5, reviewCount: "many" },
    ]) {
      expect(ratingInfo(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("OfferTable with ratings", () => {
  it("shows a star, the score and the review count for an offer with enough reviews", () => {
    inRouter(<OfferTable offers={[offer("a", "priceoye", 100000, { rating: 4.9, reviewCount: 295 })]} name="iPhone X" />);
    const tag = screen.getByTitle(/rated this 4\.9 out of 5, from 295 reviews/);
    expect(tag.textContent).toContain("★");
    expect(tag.textContent).toContain("4.9");
    expect(tag.textContent).toContain("295 reviews");
    expect(screen.getByText("Rated 4.9 out of 5 by 295 reviews at PriceOye.")).toBeInTheDocument();
  });

  it("shows only the number of reviews, with no score or star, when there are too few", () => {
    inRouter(<OfferTable offers={[offer("a", "priceoye", 100000, { rating: 5, reviewCount: 1 })]} name="iPhone X" />);
    const tag = screen.getByTitle(/shows 5\.0 out of 5, but from 1 review only/);
    expect(tag.textContent).not.toContain("★");
    expect(tag.textContent).not.toContain("5.0");
    expect(tag.textContent).toContain("1 review");
    expect(tag).toHaveClass("muted");
  });

  it("shows nothing for an offer without a rating, next to one that has it", () => {
    inRouter(<OfferTable offers={[offer("a", "priceoye", 100000, { rating: 4.8, reviewCount: 20 }), offer("b", "mega", 101000)]} name="iPhone X" />);
    expect(screen.getAllByTitle(/out of 5/)).toHaveLength(1);
    expect(within(row("Mega.pk")).queryByText(/★/)).toBeNull();
    expect(within(row("Mega.pk")).queryByText(/review/)).toBeNull();
  });

  it("puts each store's rating in that store's own row", () => {
    inRouter(<OfferTable offers={[offer("a", "priceoye", 100000, { rating: 4.8, reviewCount: 20 }), offer("b", "shophive", 101000, { rating: 3.5, reviewCount: 40 })]} name="iPhone X" />);
    expect(row("PriceOye").textContent).toContain("4.8");
    expect(row("PriceOye").textContent).not.toContain("3.5");
    expect(row("Shophive").textContent).toContain("3.5");
    expect(row("Shophive").textContent).not.toContain("4.8");
  });

  it("has no accessibility violations (the star is hidden from screen readers, a full sentence replaces it)", async () => {
    const { container } = inRouter(<OfferTable offers={[
      offer("a", "priceoye", 100000, { rating: 4.9, reviewCount: 295 }), offer("b", "shophive", 101000, { rating: 5, reviewCount: 1 }), offer("c", "mega", 102000),
    ]} name="iPhone X" />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
