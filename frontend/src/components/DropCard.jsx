// DropCard.jsx — one offer whose price just came down: the new price, the price it was on the previous check, and by how much.
// The "was" price here is what WE recorded on an earlier day, never the store's own crossed-out price.

import { Link } from "react-router-dom";

import { categoryName } from "../lib/categories.js";
import { formatDropPercent, formatDay } from "../lib/drops.js";
import { formatPrice } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { StoreMark } from "./StoreLogo.jsx";
import ProductImage from "./ProductImage.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import "./cards.css";

export default function DropCard({ item }) {
  const { drop } = item;
  return (
    <article className="product-card card">
      <Link to={`/product/${item._id}`} className="product-card__link">
        <ProductImage src={item.imageUrl} alt="" />
        <p className="product-card__kicker small muted">{categoryName(item.productCategory)}</p>
        <h3 className="product-card__name">{item.title}</h3>
      </Link>

      <div className="product-card__price">
        <span className="price product-card__amount">{formatPrice(drop.price)}</span>
        <span className="product-card__store small muted">
          <StoreMark platform={item.platform} size={18} /> {platformName(item.platform)}
        </span>
      </div>

      <div className="product-card__badges">
        <VerdictBadge
          tone="good"
          label={formatDropPercent(drop.percent)}
          title={`${formatPrice(drop.rupees)} less than when we checked on ${formatDay(drop.beforeDay)}`}
        />
      </div>

      <p className="small muted">
        Was <s>{formatPrice(drop.before)}</s> on {formatDay(drop.beforeDay)} · this price since {formatDay(drop.day)}
      </p>
    </article>
  );
}
