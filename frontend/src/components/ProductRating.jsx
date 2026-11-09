// ProductRating.jsx — the product's rating, once for the product: "★ 4.6 · 42 reviews at PriceOye" (lib/rating.js productRating).
// Nothing when no store gives a rating with enough reviews.

import { productRating } from "../lib/rating.js";
import "./cards.css";

export default function ProductRating({ offers, className = "" }) {
  const rating = productRating(offers);
  if (!rating) return null;
  return (
    <p className={`product-rating small ${className}`.trim()} title={rating.title}>
      <span aria-hidden="true"><span className="product-rating__star">★</span> {rating.value} <span className="muted">· {rating.countText} at {rating.store}</span></span>
      <span className="visually-hidden">{rating.spoken}</span>
    </p>
  );
}
