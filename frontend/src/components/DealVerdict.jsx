import { RECOMMENDATION_LABELS, DISCOUNT_LABELS } from "./dealLabels";

const MARKET_TEXT = {
  anomalous: { text: "Above market", cls: "disc-market" },
  consistent: { text: "In line with other stores", cls: "disc-genuine" },
  not_comparable: { text: "Not enough stores to compare", cls: "disc-unverified" },
};

/**
 * The three independent checks behind a listing's verdict, each with the
 * reason the backend gave. Showing the reasons is the point: a bare "Fake
 * Discount" label asks the shopper to take the system's word for it.
 */
function DealVerdict({ listing }) {
  const rec =
    RECOMMENDATION_LABELS[listing.recommendation?.action] || RECOMMENDATION_LABELS.NO_HISTORY;
  const analysis = listing.discountAnalysis || {};
  const disc = DISCOUNT_LABELS[analysis.classification] || { text: "", cls: "" };
  const market = MARKET_TEXT[listing.discountAnomaly?.status];

  return (
    <div className="verdict-grid">
      <div className="verdict-card">
        <div className="verdict-title">Should you buy?</div>
        <span className={`rec-pill ${rec.cls}`}>{rec.text}</span>
        <p className="verdict-reason">
          {listing.recommendation?.reason || "Not enough price history yet to judge this price."}
        </p>
      </div>

      <div className="verdict-card">
        <div className="verdict-title">Is the discount real?</div>
        {disc.text ? (
          <span className={`disc-badge ${disc.cls}`}>{disc.text}</span>
        ) : (
          <span className="verdict-none">No discount claimed</span>
        )}
        {analysis.reason && disc.text && <p className="verdict-reason">{analysis.reason}</p>}
      </div>

      <div className="verdict-card">
        <div className="verdict-title">Compared with other stores</div>
        {market ? (
          <span className={`disc-badge ${market.cls}`}>{market.text}</span>
        ) : (
          <span className="verdict-none">Not assessed</span>
        )}
        {listing.discountAnomaly?.reason && (
          <p className="verdict-reason">{listing.discountAnomaly.reason}</p>
        )}
      </div>
    </div>
  );
}

export default DealVerdict;
