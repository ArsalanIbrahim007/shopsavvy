// ResultGroup.jsx — one product, laid out for the product page: photo, name, verdict, how much a
// shopper can save across stores, the best price, and the offers table underneath (every offer,
// cheapest first). The verdict badges describe the offer whose price is shown, so the price and its
// verdict always agree (see cardBadges).
//
// The results list shows the compact ProductCard instead; clicking one leads here.

import { categoryName } from "../../lib/categories.js";
import { coloursOf, offersInColour, unstatedColourCount } from "../../lib/colours.js";
import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { ptaFlag, ptaNotice } from "../../lib/pta.js";
import { summarizeOffers } from "../../lib/summary.js";
import { cardBadges } from "../../lib/verdicts.js";
import ColourPicker from "../ColourPicker.jsx";
import ProductImage from "../ProductImage.jsx";
import VerdictBadge from "../VerdictBadge.jsx";
import OfferTable from "./OfferTable.jsx";
import "./results.css";

const isSuspect = (offer) => offer?.priceCheck?.status?.startsWith("suspect");

export default function ResultGroup({ group, currentId, colour = null, onColour }) {
  const allOffers = group.offers ?? [];
  // A colour that none of the offers has (an old link) is ignored rather than showing an empty page.
  const choices = coloursOf(allOffers);
  const chosen = colour && choices.some((c) => c.colour === colour) ? colour : null;
  // The main picture follows the colour: the picture a store gives for it, else the usual one.
  const chosenImage = chosen ? choices.find((c) => c.colour === chosen)?.image ?? null : null;
  const offers = offersInColour(allOffers, chosen);
  const unstated = chosen ? unstatedColourCount(offers) : 0;
  const summary = summarizeOffers(offers);
  const best = summary.lowest;
  if (!best) return null;

  // Only prices we believe, and that compare like with like, count towards "you can save".
  const believable = offers.filter((offer) => !isSuspect(offer) && !offer.ptaAssessment && offer.inStock !== false).map((offer) => offer.price);
  const saving = believable.length > 1 ? Math.max(...believable) - Math.min(...believable) : 0;
  const badges = cardBadges(best);
  const category = best.productCategory;
  const pta = ptaFlag(best);
  const notice = ptaNotice(offers);

  return (
    <article className="result-group card">
      <div className="result-group__head">
        <div className="result-group__image">
          <ProductImage src={chosenImage ?? best.imageUrl} alt={chosen ? `${group.productName}, ${chosen}` : group.productName} height={140} priority />
        </div>

        <div className="result-group__info">
          <div className="result-group__badges">
            {category && <span className="badge badge-neutral">{categoryName(category)}</span>}
            {pta && <VerdictBadge tone={pta.tone} label={pta.label} title={pta.reason} />}
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

      {notice && <p className="result-group__pta small" role="note">{notice}</p>}

      {onColour && <ColourPicker offers={allOffers} value={chosen} onChange={onColour} />}
      {chosen && unstated > 0 && (
        <p className="colour-picker__note small muted">
          {unstated === 1 ? "1 offer does" : `${unstated} offers do`} not say which colour, so {unstated === 1 ? "it stays" : "they stay"} in the list.
        </p>
      )}

      <OfferTable offers={offers} name={group.productName} currentId={currentId} colour={chosen} />
    </article>
  );
}
