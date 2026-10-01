// DealVerdict.jsx — the three independent checks behind a listing's verdict, each with the reason the server gave:
// should you buy, is the discount real, and how does the price compare with other stores. Showing the reasons is
// the point: a bare "Fake discount" label asks the shopper to take the system's word for it.

import { DISCOUNT_VERDICTS, marketVerdict, recommendationOf } from "../../lib/verdicts.js";
import VerdictBadge from "../VerdictBadge.jsx";
import "./product.css";

function Card({ title, children }) {
  return (
    <div className="verdict-card card">
      <h3 className="verdict-card__title">{title}</h3>
      {children}
    </div>
  );
}

export default function DealVerdict({ listing }) {
  const rec = recommendationOf(listing);
  const discount = DISCOUNT_VERDICTS[listing.discountAnalysis?.classification];
  const market = marketVerdict(listing);

  return (
    <div className="verdict-grid">
      <Card title="Should you buy?">
        <VerdictBadge tone={rec.tone} label={rec.label} />
        <p className="muted">{listing.recommendation?.reason || "There is not enough price history yet to judge this price."}</p>
      </Card>

      <Card title="Is the discount real?">
        {discount ? (
          <>
            <VerdictBadge tone={discount.tone} label={discount.label} />
            {listing.discountAnalysis.reason && <p className="muted">{listing.discountAnalysis.reason}</p>}
          </>
        ) : (
          <p className="muted">This store does not claim a discount.</p>
        )}
      </Card>

      <Card title="Compared with other stores">
        {market ? (
          <>
            <VerdictBadge tone={market.tone} label={market.label} />
            {market.reason && <p className="muted">{market.reason}</p>}
          </>
        ) : (
          <p className="muted">Not assessed for this offer.</p>
        )}
      </Card>
    </div>
  );
}
