import { describe, it, expect } from "vitest";

import { extractPriceOyeRating } from "../src/services/ratingPage.service.js";

// The rating block as PriceOye's product page writes it (read 2026-10-08), with the stars as images.
const block = (points, count, wrapper = "po-rating-section") =>
  `<div class="po-info-card po-rating-reward"><div class="${wrapper}"><div class="rating-star-group"><div class="star-icon"><img src="https://static.priceoye.pk/images/stars.svg" alt="Rating Star"></div>` +
  `<div class="rating-points">${points}</div></div><span> | </span><div class="rating-count">${count} </div></div></div>`;
const page = (body, head = "") => `<html><head>${head}</head><body><h1>Apple iPhone X</h1>${body}</body></html>`;

// PriceOye's structured data says 5 whatever buyers gave: on the same pages the visible ratings were 4.9, 4.8, 4.5 and 4.0.
const JSON_LD_SAYS_FIVE = `<script type="application/ld+json">{"@type":"Product","aggregateRating":{"@type":"AggregateRating","bestRating":"5","ratingValue":5,"ratingCount":109}}</script>`;

describe("extractPriceOyeRating", () => {
  it("reads the rating shoppers see and the number of reviews it rests on", () => {
    expect(extractPriceOyeRating(page(block("4.0", "109 Reviews")))).toEqual({ rating: 4, reviewCount: 109 });
    expect(extractPriceOyeRating(page(block("4.9", "295 Reviews")))).toEqual({ rating: 4.9, reviewCount: 295 });
    expect(extractPriceOyeRating(page(block("5.0", "1 Review")))).toEqual({ rating: 5, reviewCount: 1 }); // "Review", singular
  });

  it("takes the visible rating, not the structured data that says 5 on every product", () => {
    expect(extractPriceOyeRating(page(block("4.0", "109 Reviews"), JSON_LD_SAYS_FIVE))).toEqual({ rating: 4, reviewCount: 109 });
    expect(extractPriceOyeRating(page("<p>no rating block</p>", JSON_LD_SAYS_FIVE))).toBeNull(); // structured data alone is never believed
  });

  it("copes with surrounding whitespace, a thousands separator and any letter case", () => {
    expect(extractPriceOyeRating(page(block("  4.8\n", "\n 1,204   REVIEWS  ")))).toEqual({ rating: 4.8, reviewCount: 1204 });
  });

  it("rounds to one decimal and accepts a decimal comma", () => {
    expect(extractPriceOyeRating(page(block("4.66", "10 Reviews")))).toEqual({ rating: 4.7, reviewCount: 10 });
    expect(extractPriceOyeRating(page(block("4,5", "10 Reviews")))).toEqual({ rating: 4.5, reviewCount: 10 });
  });

  it("gives null when the page shows no usable rating: zero stars, no reviews, off the scale, or not a number", () => {
    for (const [points, count] of [
      ["0.0", "12 Reviews"], ["0", "12 Reviews"], ["5.0", "0 Reviews"], ["5.0", "No Reviews"], ["5.0", ""], ["", "12 Reviews"], ["", ""],
      ["6.0", "12 Reviews"], ["-1", "12 Reviews"], ["n/a", "12 Reviews"], ["4.5", "12"], ["4.5", "Reviews"], ["4.5", "1.5 Reviews"], ["4.5", "twelve Reviews"], ["4.5", "12 Reviews and counting"], ["4.5", "12 Reviewsx"],
    ]) {
      expect(extractPriceOyeRating(page(block(points, count))), `${points} / ${count}`).toBeNull();
    }
  });

  it("gives null for empty input, a page without the rating block, and a rating written anywhere else", () => {
    for (const html of ["", undefined, null, "<html></html>", page("<p>4.5 | 12 Reviews</p>"), page(block("4.5", "12 Reviews", "some-other-section"))]) {
      expect(extractPriceOyeRating(html)).toBeNull();
    }
  });

  it("reads the product's own rating block, the first one, and not a later one such as a related product's", () => {
    const html = page(block("4.2", "30 Reviews") + block("5.0", "999 Reviews"));
    expect(extractPriceOyeRating(html)).toEqual({ rating: 4.2, reviewCount: 30 });
  });

  it("takes the points and the count from inside that block only", () => {
    const stray = `<div class="rating-points">1.0</div><div class="rating-count">5 Reviews</div>`;
    expect(extractPriceOyeRating(page(stray + block("4.4", "20 Reviews")))).toEqual({ rating: 4.4, reviewCount: 20 });
  });
});
