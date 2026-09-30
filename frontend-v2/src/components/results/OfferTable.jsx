// OfferTable.jsx — one product's offers side by side: store, price (with the store's "was" price and
// a verdict on it), stock, when it was last updated, and a link to the store. Cheapest first, with the
// lowest believable price marked, and the listing the shopper opened labelled. Every offer is shown.
//
// "Discount" never repeats a store's claim as fact: the cell shows the verdict (verified / fake /
// suspicious / above market / unusual price). A claim we could not check is shown as a claim.

import { claimedDiscount } from "../../lib/filters.js";
import { formatPercent, formatPrice, timeAgo } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { offerLink } from "../../lib/safeLink.js";
import { offerFlags } from "../../lib/verdicts.js";
import { summarizeOffers } from "../../lib/summary.js";
import VerdictBadge from "../VerdictBadge.jsx";
import "./results.css";

function DiscountCell({ offer }) {
  const flags = offerFlags(offer);
  if (flags.length > 0) {
    return (
      <div className="offer-table__flags">
        {flags.map((flag) => <VerdictBadge key={flag.id} tone={flag.tone} label={flag.label} title={flag.reason} />)}
      </div>
    );
  }
  const claimed = claimedDiscount(offer);
  return claimed > 0
    ? <span className="small muted">Claims {formatPercent(claimed)} off</span>
    : <span className="small muted">No discount claimed</span>;
}

export default function OfferTable({ offers, name, currentId }) {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const lowestId = summarizeOffers(offers).lowest?._id;
  const rows = sorted;

  return (
    <div className="offer-table__wrap">
      <table className="offer-table">
        <caption className="visually-hidden">Offers for {name}, cheapest first</caption>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col" className="num">Price</th>
            <th scope="col">Discount</th>
            <th scope="col">Stock</th>
            <th scope="col">Updated</th>
            <th scope="col"><span className="visually-hidden">Link</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((offer) => {
            const href = offerLink(offer);
            const isLowest = offer._id === lowestId;
            return (
              <tr key={offer._id} className={isLowest ? "is-lowest" : undefined}>
                <td>
                  <span className="offer-table__store">{platformName(offer.platform)}</span>
                  {isLowest && <span className="offer-table__lowest small">Lowest price</span>}
                  {offer._id === currentId && <span className="offer-table__current small muted">The one you opened</span>}
                </td>
                <td className="num">
                  <span className="price offer-table__price">{formatPrice(offer.price)}</span>
                  {offer.originalPrice > offer.price && (
                    <span className="price offer-table__was small muted">{formatPrice(offer.originalPrice)}</span>
                  )}
                </td>
                <td><DiscountCell offer={offer} /></td>
                <td className="small">{offer.inStock === false ? <span className="muted">Out of stock</span> : "In stock"}</td>
                <td className="small muted">{offer.lastScrapedAt ? timeAgo(offer.lastScrapedAt) : ""}</td>
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
    </div>
  );
}
