// FairPrice.jsx — "Fair price for these specs": what the trained price model (a linear regression on the title's words, storage, RAM,
// screen, tonnage, the store and more: backend services/fairPrice.service.js) expects this product to cost, and how far the lowest price
// sits from it. Shown only where the server sends one (the model is used only in the categories where it beat simple baselines).

import { fairPriceGap } from "../../lib/fairPrice.js";
import { formatPrice } from "../../lib/format.js";

export default function FairPrice({ price, fair }) {
  const gap = fairPriceGap(price, fair);
  if (!gap) return null;
  return (
    <p className="fair-price small" title={`Our price model's estimate from the product's specs. Prices of products it had never seen were within ${Math.round(fair.medianError * 100)}% of its estimate half the time.`}>
      <span className="fair-price__label">Fair price for these specs</span>{" "}
      <span className="price fair-price__value">{formatPrice(fair.price)}</span>
      <span className={`fair-price__gap fair-price__gap--${gap.tone}`}> · {gap.text}</span>
    </p>
  );
}
