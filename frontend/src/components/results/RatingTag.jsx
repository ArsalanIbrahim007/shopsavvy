// RatingTag.jsx — a store's own buyers' rating of an offer, next to the store's name: "★ 4.9 (295 reviews)". An offer with too few
// reviews shows only how many, muted, and no score (see lib/rating.js). Nothing at all when the store gives no rating.

import { ratingInfo } from "../../lib/rating.js";

export default function RatingTag({ offer }) {
  const info = ratingInfo(offer);
  if (!info) return null;

  if (!info.enough) {
    return (
      <span className="offer-table__rating offer-table__rating--thin small muted" title={info.title}>
        <span aria-hidden="true">{info.countText}</span>
        <span className="visually-hidden">{info.spoken}</span>
      </span>
    );
  }
  return (
    <span className="offer-table__rating small" title={info.title}>
      <span aria-hidden="true"><span className="offer-table__star">★</span> {info.value} <span className="muted">({info.countText})</span></span>
      <span className="visually-hidden">{info.spoken}</span>
    </span>
  );
}
