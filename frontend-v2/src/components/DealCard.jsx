// DealCard.jsx — one verified deal on the home page. The saving shown is the server's:
// the cheapest offer against the median of the offers considered, never a store's own
// "was" price (see the deals feed rules in the backend).

import { Link } from "react-router-dom";

import { formatPrice, timeAgo } from "../lib/format.js";
import { categoryName } from "../lib/categories.js";
import { platformName } from "../lib/platforms.js";
import { StoreMark } from "./StoreLogo.jsx";
import ProductImage from "./ProductImage.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import "./cards.css";

export default function DealCard({ deal }) {
  const lowest = deal.lowest ?? {};

  return (
    <article className="product-card card">
      <Link to={`/product/${lowest._id}`} className="product-card__link" aria-label={`${deal.productName}, ${formatPrice(lowest.price)} at ${platformName(lowest.platform)}`}>
        <ProductImage src={deal.imageUrl} alt="" />
        <p className="product-card__kicker small muted">{categoryName(deal.category)}</p>
        <h3 className="product-card__name">{deal.productName}</h3>
      </Link>

      <div className="product-card__price">
        <span className="price product-card__amount">{formatPrice(lowest.price)}</span>
        <span className="product-card__store small muted">
          <StoreMark platform={lowest.platform} size={18} /> {platformName(lowest.platform)}
        </span>
      </div>

      <div className="product-card__badges">
        <VerdictBadge
          tone="good"
          label={`${Math.round(deal.savingPercent)}% below typical`}
          title={`Typical price ${formatPrice(deal.referencePrice)}, so you save about ${formatPrice(deal.savingAmount)}`}
        />
      </div>

      <p className="small muted">
        Save about {formatPrice(deal.savingAmount)} · {deal.offerCount} offers from {deal.storeCount} stores
        {deal.updatedAt ? ` · updated ${timeAgo(deal.updatedAt)}` : ""}
      </p>
    </article>
  );
}
