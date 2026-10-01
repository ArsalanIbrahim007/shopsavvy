// PriceOutlook.jsx — "Wait or buy?": what the product's own recorded prices say about waiting, with the evidence.
// It is not a forecast and says so. Most products have too little history for a verdict for now; the panel then says "too early"
// plainly instead of guessing (see lib/outlook.js). Shows nothing when the server sent no outlook.

import { Link } from "react-router-dom";

import { describeOutlook } from "../../lib/outlook.js";
import VerdictBadge from "../VerdictBadge.jsx";
import "./product.css";

export default function PriceOutlook({ outlook }) {
  const view = describeOutlook(outlook);
  if (!view) return null;

  return (
    <section className="product-section" aria-labelledby="outlook-heading">
      <h2 id="outlook-heading">Wait or buy?</h2>
      <div className="outlook card">
        <div className="outlook__badges">
          <VerdictBadge tone={view.tone} label={view.label} />
          {view.early && <span className="badge badge-neutral" title="Based on less than four weeks of price records">Early estimate</span>}
        </div>
        <p className="outlook__headline">{view.headline}</p>
        {view.detail && <p className="muted">{view.detail}</p>}
        {view.facts.length > 0 && (
          <ul className="outlook__facts">
            {view.facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        )}
        {view.market && <p className="small muted">{view.market}</p>}
        <p className="small muted">
          This is not a forecast. It shows where today's price sits among the prices we have recorded, and cannot know about a sale or a
          price rise. <Link to="/honest-prices">How much to trust it</Link>
        </p>
      </div>
    </section>
  );
}
