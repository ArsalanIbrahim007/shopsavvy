// ProductCard.jsx — one product (a group of offers for the same product) in the results list:
// image, name, the best believable price and who has it, how many offers, and the verdict.
// Clicking it opens the product page, which shows every store's offer side by side.

import { Link, useLocation } from "react-router-dom";

import { formatPrice } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { cardBadges } from "../lib/verdicts.js";
import { summarizeOffers } from "../lib/summary.js";
import ProductImage from "./ProductImage.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import "./cards.css";

export default function ProductCard({ group }) {
  const { pathname, search } = useLocation();
  const offers = group.offers ?? [];
  const summary = summarizeOffers(offers);
  const best = summary.lowest;
  if (!best) return null;

  // The badges describe the offer whose price is shown, so the price and its verdict always agree.
  const badges = cardBadges(best);

  return (
    <article className="product-card card">
      {/* `from` lets the product page's back link return to this exact list, filters included; `name` keeps the
          title the shopper clicked (the page re-groups the product, and its first title can differ) */}
      <Link to={`/product/${best._id}`} state={{ from: `${pathname}${search}`, name: group.productName }} className="product-card__link" aria-label={`${group.productName}, from ${formatPrice(best.price)}`}>
        <ProductImage src={best.imageUrl} alt="" />
        <h3 className="product-card__name">{group.productName}</h3>
      </Link>

      <div className="product-card__price">
        <span className="price product-card__amount">{formatPrice(best.price)}</span>
        <span className="small muted">at {platformName(best.platform)}</span>
      </div>

      <div className="product-card__badges">
        {badges.map((badge) => (
          <VerdictBadge key={badge.id} tone={badge.tone} label={badge.label} title={badge.reason} />
        ))}
      </div>

      <p className="small muted">
        {summary.count} {summary.count === 1 ? "offer" : "offers"} from {summary.platformCount} {summary.platformCount === 1 ? "store" : "stores"}
      </p>
    </article>
  );
}
