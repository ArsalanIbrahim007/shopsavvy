// DealVerdict.jsx — the three independent checks behind a listing's verdict, each with the reason the server gave:
// is this store's price good, is the discount real, and how does the price compare with other stores. Showing the
// reasons is the point: a bare "Fake discount" label asks the shopper to take the system's word for it.
//
// Whether to buy now or wait is "Wait or buy?" above (PriceOutlook), for the product at every store; the first card
// here is only about this store's price, and is named so the page does not ask "should you buy?" twice.

import { DISCOUNT_VERDICTS, marketVerdict, offerVerdict, reasonPoints } from "../../lib/verdicts.js";
import VerdictBadge from "../VerdictBadge.jsx";
import "./product.css";

/** A server reason, one sentence per line: the server joins up to six, which read as one wall of text. */
function Reason({ text }) {
  const points = reasonPoints(text);
  if (points.length === 0) return null;
  if (points.length === 1) return <p className="muted">{points[0]}</p>;
  return (
    <ul className="verdict-card__points muted">
      {points.map((point) => <li key={point}>{point}</li>)}
    </ul>
  );
}

function Card({ title, children }) {
  return (
    <div className="verdict-card card">
      <h3 className="verdict-card__title">{title}</h3>
      {children}
    </div>
  );
}

export default function DealVerdict({ listing, lowestPrice = null }) {
  const rec = offerVerdict(listing, { lowestPrice });
  const discount = DISCOUNT_VERDICTS[listing.discountAnalysis?.classification];
  const market = marketVerdict(listing);

  return (
    <div className="verdict-grid">
      <Card title="This store's price">
        <VerdictBadge tone={rec.tone} label={rec.label} />
        <Reason text={rec.reason || "There is not enough price history yet to judge this price."} />
      </Card>

      <Card title="Is the discount real?">
        {discount ? (
          <>
            <VerdictBadge tone={discount.tone} label={discount.label} />
            <Reason text={listing.discountAnalysis.reason} />
          </>
        ) : (
          <p className="muted">This store does not claim a discount.</p>
        )}
      </Card>

      <Card title="Compared with other stores">
        {market ? (
          <>
            <VerdictBadge tone={market.tone} label={market.label} />
            <Reason text={market.reason} />
          </>
        ) : (
          <p className="muted">Not assessed for this offer.</p>
        )}
      </Card>
    </div>
  );
}
