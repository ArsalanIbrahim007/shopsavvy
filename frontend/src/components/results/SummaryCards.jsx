// SummaryCards.jsx — the four headline numbers above the results: how many stores were compared, the
// lowest price, the average, and the best deal. All of them are computed from the offers currently
// shown (so they follow the filters), and an offer flagged as a probable listing error is never
// presented as the lowest price or the best deal (see summarizeOffers).

import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import "./results.css";

export default function SummaryCards({ summary }) {
  const { lowest, bestDeal, average, platformCount, count, preOwnedOnly } = summary;
  const score = Number.isFinite(bestDeal?.dealScore) ? Math.round(bestDeal.dealScore) : null;

  return (
    <div className="summary-cards" role="group" aria-label="Summary of these results">
      <div className="card summary-card">
        <p className="eyebrow">Stores compared</p>
        <p className="summary-card__value">{platformCount}</p>
        <p className="small muted">{count} {count === 1 ? "offer" : "offers"} shown</p>
      </div>
      <div className="card summary-card">
        <p className="eyebrow">{preOwnedOnly ? "Lowest pre-owned price" : "Lowest price"}</p>
        <p className="summary-card__value price">{lowest ? formatPrice(lowest.price) : "—"}</p>
        <p className="small muted">{lowest ? `at ${platformName(lowest.platform)}` : ""}</p>
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Average price</p>
        <p className="summary-card__value price">{average !== null ? formatPrice(average) : "—"}</p>
        <p className="small muted">across the offers shown</p>
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Best deal</p>
        <p className="summary-card__value">{bestDeal ? platformName(bestDeal.platform) : "—"}</p>
        <p className="small muted">{score !== null ? `Deal score ${score} out of 100` : "Not scored"}</p>
      </div>
    </div>
  );
}
