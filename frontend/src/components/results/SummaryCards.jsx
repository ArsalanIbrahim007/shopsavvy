// SummaryCards.jsx — the four headline numbers above the results: how many stores were compared, the
// lowest price, the biggest saving on one product, and the best deal. All of them follow the filters, and an
// offer flagged as a probable listing error is never presented as the lowest price or the best deal (see
// summarizeOffers).
//
// The lowest price, best deal and saving are about the category the shopper searched for (`main`), named
// when the results also hold other things: a search for "iphone 17 pro" finds cases too. There is no average
// price: across different products (a 256 GB Pro and a 2 TB Pro Max) an average describes nothing. Where PTA-approved phones are
// in view, the lowest price and best deal are among them, and a cheaper non-PTA offer is named beside them (headlinePrices).

import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import "./results.css";

// PTA status, said only where non-PTA phones are in view (see headlinePrices): "PTA approved, " before the store when a cheaper
// non-PTA offer is shown beside it, "Non-PTA, " when the price itself is a non-PTA phone's.
const ptaWord = (offer, nonPta) => (offer?.ptaStatus === "non_pta" ? "Non-PTA, " : nonPta ? "PTA approved, " : "");

export default function SummaryCards({ summary, main = summary, mainCategory = null, saving = null }) {
  const { platformCount, count, outOfDate } = summary;
  const { lowest, bestDeal, preOwnedOnly, nonPta = null } = main;
  const score = Number.isFinite(bestDeal?.dealScore) ? Math.round(bestDeal.dealScore) : null;
  const scope = mainCategory ? `${mainCategory}, ` : "";

  return (
    <div className="summary-cards" role="group" aria-label="Summary of these results">
      <div className="card summary-card">
        <p className="eyebrow">Stores compared</p>
        <p className="summary-card__value">{platformCount}</p>
        <p className="small muted">
          {count} {count === 1 ? "offer" : "offers"} shown
          {outOfDate > 0 ? `, ${outOfDate} with an old price not counted` : ""}
        </p>
      </div>
      <div className="card summary-card">
        <p className="eyebrow">{preOwnedOnly ? "Lowest pre-owned price" : "Lowest price"}</p>
        <p className="summary-card__value price">{lowest ? formatPrice(lowest.price) : "—"}</p>
        <p className="small muted">{lowest ? `${scope}${ptaWord(lowest, nonPta)}at ${platformName(lowest.platform)}` : ""}</p>
        {nonPta && (
          <p className="small summary-card__note">Non-PTA from {formatPrice(nonPta.price)} at {platformName(nonPta.platform)}</p>
        )}
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Biggest saving</p>
        <p className="summary-card__value price">{saving ? formatPrice(saving.saving) : "—"}</p>
        <p className="small muted">
          {saving ? `on ${saving.group.productName}, cheapest store against dearest` : "No product here is sold at two different prices"}
        </p>
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Best deal</p>
        <p className="summary-card__value">{bestDeal ? platformName(bestDeal.platform) : "—"}</p>
        <p className="small muted">{score !== null ? `${scope}${ptaWord(bestDeal, nonPta)}deal score ${score} out of 100` : "Not scored"}</p>
      </div>
    </div>
  );
}
