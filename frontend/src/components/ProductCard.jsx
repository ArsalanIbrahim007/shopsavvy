// ProductCard.jsx — one product (a group of offers for the same product) in the results list:
// image, name, the best believable price and who has it, how many offers, and the verdict.
// Clicking it opens the product page, which shows every store's offer side by side.

import { Link, useLocation } from "react-router-dom";

import { formatPrice } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { ptaFlag } from "../lib/pta.js";
import { scoreOf } from "../lib/score.js";
import { StoreMark } from "./StoreLogo.jsx";
import { cardBadges } from "../lib/verdicts.js";
import { summarizeOffers } from "../lib/summary.js";
import { ColourStrip } from "./ColourPicker.jsx";
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
  const score = scoreOf(best);
  const pta = ptaFlag(best);

  return (
    <article className="product-card card">
      {/* `from` lets the product page's back link return to this exact list, filters included; `name` keeps the
          title the shopper clicked (the page re-groups the product, and its first title can differ) */}
      <Link to={`/product/${best._id}`} state={{ from: `${pathname}${search}`, name: group.productName }} className="product-card__link">
        <ProductImage src={best.imageUrl} alt="" />
        <h3 className="product-card__name">{group.productName}</h3>
      </Link>

      <div className="product-card__price">
        <span className="price product-card__amount">{formatPrice(best.price)}</span>
        <span className="product-card__store small muted">
          <StoreMark platform={best.platform} size={18} /> {platformName(best.platform)}
        </span>
      </div>

      <div className="product-card__badges">
        {score !== null && <span className="badge badge-neutral" title="Deal score out of 100: price, store trust, freshness and availability">Score {Math.round(score)}</span>}
        {pta && <VerdictBadge tone={pta.tone} label={pta.label} title={pta.reason} />}
        {badges.map((badge) => (
          <VerdictBadge key={badge.id} tone={badge.tone} label={badge.label} title={badge.reason} />
        ))}
      </div>

      <ColourStrip offers={offers} />

      <p className="small muted">
        {summary.count} {summary.count === 1 ? "offer" : "offers"} from {summary.platformCount} {summary.platformCount === 1 ? "store" : "stores"}
      </p>
    </article>
  );
}
