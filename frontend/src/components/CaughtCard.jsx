// CaughtCard.jsx — one discount our checks caught (home page, "Deals we didn't show you"): what the store claims, and the evidence
// against it, in numbers we recorded. Never a deal: it links to the product page, where every store's real price is.

import { Link } from "react-router-dom";

import { evidenceOf } from "../lib/caught.js";
import { formatPrice } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { productPath } from "../lib/productPath.js";
import { prefetchProps } from "../lib/prefetch.js";
import { StoreMark } from "./StoreLogo.jsx";
import ProductImage from "./ProductImage.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import "./cards.css";

export default function CaughtCard({ item }) {
  return (
    <article className="product-card card caught-card">
      <Link {...prefetchProps(item.id)} to={productPath(item.id, item.title)} className="product-card__link">
        <ProductImage src={item.imageUrl} alt="" />
        <h3 className="product-card__name">{item.productName}</h3>
      </Link>

      <div className="product-card__price">
        <span className="caught-card__claim">
          Claims <s className="price">{formatPrice(item.originalPrice)}</s> → <span className="price">{formatPrice(item.price)}</span>
        </span>
        <span className="product-card__store small muted">
          <StoreMark platform={item.platform} size={18} /> {platformName(item.platform)}
        </span>
      </div>

      <div className="product-card__badges">
        {item.caught?.fake && <VerdictBadge tone="bad" label={`Fake ${item.claimedPercent}% off`} title="The 'was' price is above anything this store's price history shows" />}
        {item.caught?.aboveMarket && <VerdictBadge tone="caution" label="Above every other store" title="The 'was' price is higher than every other store charges for this product" />}
      </div>

      <ul className="caught-card__evidence small">
        {evidenceOf(item).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </article>
  );
}
