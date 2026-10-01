// CrossStoreSummary.jsx — the product at a glance across stores: how many were compared, the lowest and highest
// price we believe, what a shopper saves by choosing well, and which store is the best deal. An offer flagged as a
// probable listing error never sets the lowest price, the saving, or the best deal.

import { comparableOffers } from "../../lib/condition.js";
import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { bestDealOffer } from "../../lib/score.js";
import { summarizeOffers } from "../../lib/summary.js";
import "./product.css";

const suspect = (offer) => offer?.priceCheck?.status?.startsWith("suspect");

export default function CrossStoreSummary({ offers }) {
  const summary = summarizeOffers(offers);
  // used, refurbished and open-box prices are not part of the comparison (see lib/condition.js)
  const believable = comparableOffers(offers).filter((offer) => !suspect(offer)).map((offer) => offer.price);
  const highest = believable.length ? Math.max(...believable) : null;
  const lowest = summary.lowest?.price ?? null;
  const saving = highest !== null && lowest !== null ? highest - lowest : 0;
  const best = bestDealOffer(offers);

  const rows = [
    ["Stores compared", summary.platformCount],
    ["Lowest price", lowest !== null ? formatPrice(lowest) : "—"],
    ["Highest price", highest !== null ? formatPrice(highest) : "—"],
    ...(saving > 0 ? [["You can save", formatPrice(saving)]] : []),
    ["Best deal", best ? platformName(best.platform) : "—"],
  ];

  return (
    <section className="summary card" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Across stores</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd className="price">{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}
