// ProofCard.jsx — the home page hero's picture: a real discount our checks caught, shown the way a shopper meets it (the store's
// "was" price and its "% off") and then taken apart: a red line strikes the claimed price, and our own records count in beside it.
// It cycles through the caught examples (backend caughtFeed.service.js); it stops while hovered or focused, and never moves for a
// shopper who asked for reduced motion.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { prefersReducedMotion, useCountUp } from "../hooks/useCountUp.js";
import { formatNumber, formatPrice } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { productPath } from "../lib/productPath.js";
import ProductImage from "./ProductImage.jsx";
import { StoreMark } from "./StoreLogo.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import "./ProofCard.css";

const ROTATE_MS = 7000;

function Figure({ value }) {
  return <>{formatPrice(useCountUp(value))}</>;
}

function facts(item) {
  const rows = [];
  if (item.history?.highest > 0) {
    rows.push({ label: item.history.checks > 0 ? `Highest we recorded, ${formatNumber(item.history.checks)} checks` : "Highest we recorded", value: item.history.highest });
  }
  if (item.market?.highest > 0) {
    const stores = item.market.stores > 0 ? `${formatNumber(item.market.stores)} other ${item.market.stores === 1 ? "store" : "stores"}` : "other stores";
    rows.push({ label: `Highest at ${stores}`, value: item.market.highest });
  }
  if (item.lowestElsewhere > 0) rows.push({ label: "Lowest elsewhere", value: item.lowestElsewhere });
  return rows;
}

function Proof({ item }) {
  return (
    <div className="proof__body">
      <Link to={productPath(item.id, item.title)} className="proof__product">
        <ProductImage src={item.imageUrl} alt="" height={64} priority />
        <span className="proof__name">{item.productName}</span>
      </Link>

      <div className="proof__claim">
        <span className="proof__label small">
          <StoreMark platform={item.platform} size={18} /> {platformName(item.platform)} says
        </span>
        <span className="proof__was price"><s>{formatPrice(item.originalPrice)}</s></span>
        <span className="proof__now price">{formatPrice(item.price)}</span>
        {item.caught?.fake && (
          <VerdictBadge tone="bad" label={`Fake ${item.claimedPercent}% off`} title="The 'was' price is above anything this store's price history shows" />
        )}
      </div>

      <dl className="proof__facts">
        {facts(item).map((row) => (
          <div key={row.label} className="proof__fact">
            <dt className="small">{row.label}</dt>
            <dd className="price"><Figure value={row.value} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ProofCard({ caught }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const examples = caught.status === "success" ? caught.data.examples : [];
  const count = examples.length;

  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (caught.status === "loading") return <div className="proof card proof--loading" aria-hidden="true" />;
  if (count === 0) return null;

  const item = examples[index % count];
  return (
    <aside
      className="proof card"
      aria-label="A discount our checks caught"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="proof__head small">
        <span className="proof__pulse" aria-hidden="true" /> Caught by our checks
      </p>
      {/* the key replays the entrance, the strike and the counting for each example */}
      <Proof key={item.id} item={item} />
      {count > 1 && (
        <div className="proof__dots" role="group" aria-label="Examples">
          {examples.map((example, i) => (
            <button
              key={example.id}
              type="button"
              className="proof__dot"
              aria-label={`Example ${i + 1} of ${count}: ${example.productName}`}
              aria-pressed={i === index % count}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
