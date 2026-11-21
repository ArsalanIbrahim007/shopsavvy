// ProductCard.jsx — one product (a group of offers for the same product) in the results list:
// image, name, the best believable price and who has it, how many offers, and the verdict.
// Clicking it opens the product page, which shows every store's offer side by side.

import { Link, useLocation } from "react-router-dom";

import { conditionFlag } from "../lib/condition.js";
import { outOfDateFlag } from "../lib/freshness.js";
import { formatPrice } from "../lib/format.js";
import { lowestFlag } from "../lib/outlook.js";
import { platformName } from "../lib/platforms.js";
import { productPath } from "../lib/productPath.js";
import { prefetchProps } from "../lib/prefetch.js";
import { ptaFlag } from "../lib/pta.js";
import { StoreMark } from "./StoreLogo.jsx";
import { cardBadges } from "../lib/verdicts.js";
import { storeCountText, summarizeOffers } from "../lib/summary.js";
import ProductImage from "./ProductImage.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import CompareButton from "./CompareButton.jsx";
import "./cards.css";

export default function ProductCard({ group }) {
  const { pathname, search } = useLocation();
  const offers = group.offers ?? [];
  const summary = summarizeOffers(offers);
  const best = summary.lowest;
  if (!best) return null;

  // The badges describe the offer whose price is shown, so the price and its verdict always agree.
  const badges = cardBadges(best);
  const pta = ptaFlag(best);
  const condition = conditionFlag(best);
  const oldPrice = outOfDateFlag(best); // only when no offer of this product is current: otherwise the shown price is a current one
  // "Lowest we've recorded": the server's claim (group.atLow, the outlook's own rule), shown only for the price on this card
  const lowest = lowestFlag(group.atLow, best.price);

  return (
    <article className="product-card card">
      {/* `from` lets the product page's back link return to this exact list, filters included; `name` keeps the
          title the shopper clicked (the page re-groups the product, and its first title can differ) */}
      <Link {...prefetchProps(best._id)} to={productPath(best._id, best.title)} state={{ from: `${pathname}${search}`, name: group.productName }} className="product-card__link">
        <ProductImage src={best.imageUrl} alt="" />
        <h3 className="product-card__name">{group.productName}</h3>
      </Link>

      <div className="product-card__price">
        <span className="price product-card__amount">{formatPrice(best.price)}</span>
        <span className="product-card__store small muted">
          <StoreMark platform={best.platform} size={18} /> {platformName(best.platform)}
        </span>
      </div>

      {/* Two badges at most, the most important first (2026-11-21: "too much information" — a card had up to six pills, the
          colours, the rating, the offer count, the score and the check time; those are on the product page). */}
      <div className="product-card__badges">
        {[condition, oldPrice, lowest, pta, ...badges.map((badge) => ({ ...badge, key: badge.id }))]
          .filter(Boolean)
          .slice(0, 2)
          .map((flag) => <VerdictBadge key={flag.key ?? flag.label} tone={flag.tone} label={flag.label} title={flag.reason} />)}
      </div>

      <p className="small muted product-card__stores">{storeCountText(summary.platformCount)}</p>
      <CompareButton item={{ id: String(best._id), name: group.productName, category: best.productCategory, image: best.imageUrl }} />
    </article>
  );
}
