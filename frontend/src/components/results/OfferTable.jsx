// OfferTable.jsx — one product's offers side by side: store (with its logo), price with the store's was-price,
// a verdict on the discount, the deal score with its breakdown, the recommendation with a price sparkline,
// stock and freshness, and a link to the store. Cheapest first, with the lowest believable price marked, the
// best deal (highest score among believable prices, when offers were actually compared) marked, and the listing
// the shopper opened labelled. Every offer is shown.
//
// "Discount" never repeats a store's claim as fact: the cell shows the verdict (verified / fake / suspicious /
// above market / unusual price). A claim we could not check is shown as a claim.

import { Fragment, useState } from "react";

// Rows shown before "Show all offers": the cheapest that can be the lowest price (OfferTable below).
const ROWS_SHOWN = 8;

import { collapseVariants } from "../../lib/colours.js";
import { conditionFlag } from "../../lib/condition.js";
import { outOfDateFlag } from "../../lib/freshness.js";
import { claimedDiscount } from "../../lib/filters.js";
import { formatPercent, formatPrice, timeAgo } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { offerLink } from "../../lib/safeLink.js";
import { ptaFlag } from "../../lib/pta.js";
import { bestDealOffer } from "../../lib/score.js";
import { offerFlags, offerVerdict, stockLabelOf } from "../../lib/verdicts.js";
import { countsForLowest, summarizeOffers } from "../../lib/summary.js";
import { Swatch } from "../ColourPicker.jsx";
import StoreLogo from "../StoreLogo.jsx";
import VerdictBadge from "../VerdictBadge.jsx";
import RatingTag from "./RatingTag.jsx";
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

function VerdictCell({ offer, lowestPrice }) {
  const rec = offerVerdict(offer, { lowestPrice });
  return (
    <div className="offer-table__rec">
      <VerdictBadge tone={rec.tone} label={rec.label} title={rec.reason} />
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

/**
 * Which of a marketplace's sellers sells it, and its delivery (AlfaMall and DigiMall say so: 2026-11-08). Nothing for a store that
 * does not.
 */
function SellerDelivery({ offer }) {
  const parts = [];
  if (offer.seller) parts.push(`Sold by ${offer.seller}`);
  if (offer.delivery?.window) parts.push(`Delivery ${offer.delivery.window.replace(/\s*-\s*/, "–").replace(/,\s*\d{4}$/, "")}`);
  if (offer.delivery?.express) parts.push("Express");
  if (offer.delivery?.freeShipping) parts.push("Free shipping");
  if (parts.length === 0) return null;
  return <span className="offer-table__seller small muted">{parts.join(" · ")}</span>;
}

export default function OfferTable({ offers, name, currentId, colour = null }) {
  // One row per store and price: a store's colour variants at one price are one offer that lists its colours. The offers that can be
  // the lowest price come first, cheapest first; then the rest (out of stock, PTA not stated, an old price), under a line that says
  // why (2026-11-21: the header said "lowest at eezepc, PKR 68,490" above an out-of-stock PKR 68,000 and a PTA-not-stated PKR 68,200).
  const has = (entry, id) => entry.variants.some((variant) => variant._id === id);
  const byPrice = collapseVariants(offers, { colour, currentId }).sort((a, b) => a.offer.price - b.offer.price);
  const counted = byPrice.filter((entry) => countsForLowest(entry.offer));
  const rest = counted.length ? byPrice.filter((entry) => !countsForLowest(entry.offer)) : [];
  const ordered = counted.length ? [...counted, ...rest] : byPrice;
  // The first ROWS_SHOWN rows, and the rest behind a button (2026-11-21: 32 offers made the table 4,500px tall before the verdict,
  // the history or the alert). The listing the shopper opened is always shown.
  const [expanded, setExpanded] = useState(false);
  const opened = ordered.find((entry) => has(entry, currentId));
  const folded = !expanded && ordered.length > ROWS_SHOWN;
  const entries = folded ? ordered.filter((entry, i) => i < ROWS_SHOWN || entry === opened) : ordered;
  const hidden = ordered.length - entries.length;
  const firstOfRest = rest.find((entry) => entries.includes(entry))?.offer._id;
  const lowest = summarizeOffers(offers).lowest;
  const lowestId = lowest?._id;
  const bestId = bestDealOffer(offers)?._id;

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
            const oldPrice = outOfDateFlag(offer);
            return (
              <Fragment key={offer._id}>
              {offer._id === firstOfRest && (
                <tr className="offer-table__divider">
                  <td colSpan={7} className="small muted">Not counted for the lowest price: out of stock, PTA status not stated, or an old price</td>
                </tr>
              )}
              <tr className={isLowest ? "is-lowest" : rest.includes(entry) ? "is-uncounted" : undefined}>
                <td>
                  <StoreLogo platform={offer.platform} />
                  <div className="offer-table__tags">
                    {isLowest && <span className="offer-table__lowest small">Lowest price</span>}
                    {has(entry, bestId) && <span className="offer-table__best small">Best deal</span>}
                    {has(entry, currentId) && <span className="offer-table__current small muted">The one you opened</span>}
                  </div>
                  <SellerDelivery offer={offer} />
                  <RatingTag offer={offer} />
                  <ColourTag entry={entry} colour={colour} />
                  {condition && <div className="offer-table__pta"><VerdictBadge tone={condition.tone} label={condition.label} title={condition.reason} /></div>}
                  {oldPrice && <div className="offer-table__pta"><VerdictBadge tone={oldPrice.tone} label={oldPrice.label} title={oldPrice.reason} /></div>}
                  {pta && <div className="offer-table__pta"><VerdictBadge tone={pta.tone} label={pta.label} title={pta.reason} /></div>}
                </td>
                <td className="num offer-table__price-cell" data-label="Price">
                  <span className="price offer-table__price">{formatPrice(offer.price)}</span>
                  {offer.originalPrice > offer.price && (
                    <span className="price offer-table__was small muted">{formatPrice(offer.originalPrice)}</span>
                  )}
                </td>
                <td data-label="Discount"><DiscountCell offer={offer} /></td>
                <td data-label="Deal score"><ScoreCell offer={offer} /></td>
                <td data-label="Verdict"><VerdictCell offer={offer} lowestPrice={lowest?.price ?? null} /></td>
                <td className="small" data-label="Availability">
                  {((stock) => (stock.known && offer.inStock !== false ? stock.label : <span className="muted" title={stock.reason}>{stock.label}</span>))(stockLabelOf(offer))}
                  {offer.lastScrapedAt && <span className="offer-table__age muted">Price checked {timeAgo(offer.lastScrapedAt)}</span>}
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {(hidden > 0 || expanded) && ordered.length > ROWS_SHOWN && (
        <button type="button" className="btn btn-ghost offer-table__more" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded
            ? "Show fewer offers"
            : `Show all ${ordered.length} offers${rest.length ? ` (${rest.length} not counted for the lowest price)` : ""}`}
        </button>
      )}
      <p className="offer-table__note small muted">
        Deal score: price against the other stores and the fair price for its specs (60), store trust and the product's rating (20), data freshness (10) and availability (10). Hover a score for its parts.
      </p>
    </div>
  );
}
