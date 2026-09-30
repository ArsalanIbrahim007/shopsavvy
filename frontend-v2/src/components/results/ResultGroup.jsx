// ResultGroup.jsx — one product, laid out for the product page: photo, name, verdict, how much a
// shopper can save across stores, the best price, and the offers table underneath (every offer,
// cheapest first). The verdict badges describe the offer whose price is shown, so the price and its
// verdict always agree (see cardBadges).
//
// The results list shows the compact ProductCard instead; clicking one leads here.

import { categoryName } from "../../lib/categories.js";
import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { summarizeOffers } from "../../lib/summary.js";
import { cardBadges } from "../../lib/verdicts.js";
import ProductImage from "../ProductImage.jsx";
import VerdictBadge from "../VerdictBadge.jsx";
import OfferTable from "./OfferTable.jsx";
import "./results.css";

const isSuspect = (offer) => offer?.priceCheck?.status?.startsWith("suspect");

export default function ResultGroup({ group, currentId }) {
  const offers = group.offers ?? [];
  const summary = summarizeOffers(offers);
  const best = summary.lowest;
  if (!best) return null;

  // Only prices we believe count towards "you can save".
  const believable = offers.filter((offer) => !isSuspect(offer)).map((offer) => offer.price);
  const saving = believable.length > 1 ? Math.max(...believable) - Math.min(...believable) : 0;
  const badges = cardBadges(best);
  const category = best.productCategory;

  return (
    <article className="result-group card">
      <div className="result-group__head">
        <div className="result-group__image">
          <ProductImage src={best.imageUrl} alt={group.productName} height={140} />
        </div>

        <div className="result-group__info">
          <div className="result-group__badges">
            {category && <span className="badge badge-neutral">{categoryName(category)}</span>}
            {badges.map((badge) => <VerdictBadge key={badge.id} tone={badge.tone} label={badge.label} title={badge.reason} />)}
          </div>
          <h1 className="result-group__name">{group.productName}</h1>
          <p className="small muted">
            {summary.count} {summary.count === 1 ? "offer" : "offers"} from {summary.platformCount} {summary.platformCount === 1 ? "store" : "stores"}
            {saving > 0 ? ` · you can save up to ${formatPrice(saving)}` : ""}
          </p>
        </div>

        <div className="result-group__price">
          <p className="price result-group__amount">{formatPrice(best.price)}</p>
          <p className="small muted">Lowest at {platformName(best.platform)}</p>
        </div>
      </div>

      <OfferTable offers={offers} name={group.productName} currentId={currentId} />
    </article>
  );
}
