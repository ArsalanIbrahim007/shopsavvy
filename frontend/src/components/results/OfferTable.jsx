// OfferTable.jsx — one product's offers side by side: store (with its logo), price with the store's was-price,
// a verdict on the discount, the deal score with its breakdown, the recommendation with a price sparkline,
// stock and freshness, and a link to the store. Cheapest first, with the lowest believable price marked, the
// best deal (highest score among believable prices, when offers were actually compared) marked, and the listing
// the shopper opened labelled. Every offer is shown.
//
// "Discount" never repeats a store's claim as fact: the cell shows the verdict (verified / fake / suspicious /
// above market / unusual price). A claim we could not check is shown as a claim.

import { collapseVariants } from "../../lib/colours.js";
import { conditionFlag } from "../../lib/condition.js";
import { claimedDiscount } from "../../lib/filters.js";
import { formatPercent, formatPrice, timeAgo } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { offerLink } from "../../lib/safeLink.js";
import { ptaFlag } from "../../lib/pta.js";
import { bestDealOffer } from "../../lib/score.js";
import { offerFlags, recommendationOf } from "../../lib/verdicts.js";
import { summarizeOffers } from "../../lib/summary.js";
import { Swatch } from "../ColourPicker.jsx";
import StoreLogo from "../StoreLogo.jsx";
import VerdictBadge from "../VerdictBadge.jsx";
import ScoreCell from "./ScoreCell.jsx";
import Sparkline from "./Sparkline.jsx";
import "./results.css";

function DiscountCell({ offer }) {
  const flags = offerFlags(offer);
  const claimed = claimedDiscount(offer);
  return (
    <div className="offer-table__flags">
      {claimed > 0 && <span className="small muted">Claims {formatPercent(claimed)} off</span>}
      {flags.map((flag) => <VerdictBadge key={flag.id} tone={flag.tone} label={flag.label} title={flag.reason} />)}
      {claimed === 0 && flags.length === 0 && <span className="small muted">No discount claimed</span>}
    </div>
  );
}

function VerdictCell({ offer }) {
  const rec = recommendationOf(offer);
  return (
    <div className="offer-table__rec">
      <VerdictBadge tone={rec.tone} label={rec.label} title={offer.recommendation?.reason} />
      <Sparkline offer={offer} />
    </div>
  );
}

/** The colours an entry is sold in, or "colour not stated" when a colour has been chosen and this offer names none. */
function ColourTag({ entry, colour }) {
  if (entry.colours.length === 0) {
    return colour ? <span className="offer-table__colours small muted">Colour not stated</span> : null;
  }
  return (
    <span className="offer-table__colours small muted">
      {entry.colours.map((name) => <Swatch key={name} colour={name} />)}
      {entry.colours.join(", ")}
    </span>
  );
}

export default function OfferTable({ offers, name, currentId, colour = null }) {
  // One row per store and price: a store's colour variants at one price are one offer that lists its colours.
  const entries = collapseVariants(offers, { colour, currentId }).sort((a, b) => a.offer.price - b.offer.price);
  const lowestId = summarizeOffers(offers).lowest?._id;
  const bestId = bestDealOffer(offers)?._id;
  const has = (entry, id) => entry.variants.some((variant) => variant._id === id);

  return (
    <div className="offer-table__wrap">
      <table className="offer-table">
        <caption className="visually-hidden">Offers for {name}, cheapest first</caption>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col" className="num">Price</th>
            <th scope="col">Discount</th>
            <th scope="col">Deal score</th>
            <th scope="col">Verdict</th>
            <th scope="col">Availability</th>
            <th scope="col"><span className="visually-hidden">Link</span></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const offer = entry.offer;
            const href = offerLink(offer);
            const isLowest = has(entry, lowestId);
            const pta = ptaFlag(offer);
            const condition = conditionFlag(offer);
            return (
              <tr key={offer._id} className={isLowest ? "is-lowest" : undefined}>
                <td>
                  <StoreLogo platform={offer.platform} />
                  <div className="offer-table__tags">
                    {isLowest && <span className="offer-table__lowest small">Lowest price</span>}
                    {has(entry, bestId) && <span className="offer-table__best small">Best deal</span>}
                    {has(entry, currentId) && <span className="offer-table__current small muted">The one you opened</span>}
                  </div>
                  <ColourTag entry={entry} colour={colour} />
                  {condition && <div className="offer-table__pta"><VerdictBadge tone={condition.tone} label={condition.label} title={condition.reason} /></div>}
                  {pta && <div className="offer-table__pta"><VerdictBadge tone={pta.tone} label={pta.label} title={pta.reason} /></div>}
                </td>
                <td className="num">
                  <span className="price offer-table__price">{formatPrice(offer.price)}</span>
                  {offer.originalPrice > offer.price && (
                    <span className="price offer-table__was small muted">{formatPrice(offer.originalPrice)}</span>
                  )}
                </td>
                <td><DiscountCell offer={offer} /></td>
                <td><ScoreCell offer={offer} /></td>
                <td><VerdictCell offer={offer} /></td>
                <td className="small">
                  {offer.inStock === false ? <span className="muted">Out of stock</span> : "In stock"}
                  {offer.lastScrapedAt && <span className="offer-table__age muted">{timeAgo(offer.lastScrapedAt)}</span>}
                </td>
                <td>
                  {href ? (
                    <a
                      className={isLowest ? "btn btn-accent offer-table__go" : "btn btn-ghost offer-table__go"}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View deal at ${platformName(offer.platform)}`}
                    >
                      View deal
                    </a>
                  ) : (
                    <span className="small muted">Unavailable</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="offer-table__note small muted">
        The deal score combines price (60), store trust (20), data freshness (10) and availability (10). Hover or focus a score to see its parts.
      </p>
    </div>
  );
}
