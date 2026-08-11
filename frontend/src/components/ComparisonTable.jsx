import { useNavigate } from "react-router-dom";

const PLATFORM_LOGOS = {
  priceoye: "https://priceoye.pk/favicon.ico",
  shophive: "https://shophive.com/favicon.ico",
  mega: "https://mega.pk/favicon.ico",
  homeshopping: "https://homeshopping.pk/favicon.ico",
  telemart: "https://telemart.pk/favicon.ico",
  ishopping: "https://ishopping.pk/favicon.ico",
  symbios: "https://symbios.pk/favicon.ico",
};

const PLATFORM_COLORS = {
  priceoye: "#e8401c",
  shophive: "#0066cc",
  mega: "#ff6600",
  homeshopping: "#cc0000",
  telemart: "#2196F3",
  ishopping: "#4CAF50",
  symbios: "#9C27B0",
};

// Scraped data uses lowercase platform names, seeded data uses display casing.
// Normalising here keeps logos and colours consistent across both.
function canonical(platform = "") {
  return String(platform).toLowerCase().replace(/[^a-z0-9]/g, "").replace(/pk$|com$/, "");
}

const RECOMMENDATION_LABELS = {
  BUY_NOW: { text: "Buy Now", cls: "rec-buy" },
  GOOD_DEAL: { text: "Good Deal", cls: "rec-good" },
  FAIR_PRICE: { text: "Fair Price", cls: "rec-fair" },
  WAIT: { text: "Wait", cls: "rec-wait" },
  OVERPRICED: { text: "Overpriced", cls: "rec-over" },
  NO_HISTORY: { text: "No History", cls: "rec-none" },
};

const DISCOUNT_LABELS = {
  likely_fake: { text: "Fake Discount", cls: "disc-fake" },
  suspicious: { text: "Suspicious", cls: "disc-suspicious" },
  genuine_discount: { text: "Verified", cls: "disc-genuine" },
  possibly_genuine: { text: "Likely Genuine", cls: "disc-likely" },
  unverified_discount: { text: "Unverified", cls: "disc-unverified" },
  no_claimed_discount: { text: "", cls: "" },
};

function PlatformLogo({ platform }) {
  const key = canonical(platform);
  const logoUrl = PLATFORM_LOGOS[key];
  const color = PLATFORM_COLORS[key] || "#1a73e8";
  const initial = platform ? platform.charAt(0).toUpperCase() : "S";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={platform}
        referrerPolicy="no-referrer"
        className="store-logo"
        onError={(e) => {
          e.target.style.display = "none";
          if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
        }}
      />
    );
  }

  return (
    <div className="store-logo-fallback" style={{ background: color }}>
      {initial}
    </div>
  );
}

function ScoreCell({ score, breakdown, weights }) {
  const value = Number(score || 0);
  const tone = value >= 80 ? "score-high" : value >= 55 ? "score-mid" : "score-low";

  const parts = breakdown
    ? [
        { key: "price", label: "Price competitiveness", got: breakdown.price, max: weights?.price ?? 60, cls: "seg-price" },
        { key: "trust", label: "Platform trust", got: breakdown.trust, max: weights?.trust ?? 20, cls: "seg-trust" },
        { key: "freshness", label: "Data freshness", got: breakdown.freshness, max: weights?.freshness ?? 10, cls: "seg-fresh" },
        { key: "availability", label: "Availability", got: breakdown.availability, max: weights?.availability ?? 10, cls: "seg-avail" },
      ]
    : [];

  return (
    <div className="score-cell">
      <div className={`score-value ${tone}`}>{value.toFixed(1)}</div>

      {breakdown && (
        <>
          <div className="score-bar" aria-hidden="true">
            {parts.map((p) => (
              <span key={p.key} className={`seg ${p.cls}`} style={{ flexGrow: p.got || 0.01 }} />
            ))}
          </div>

          {/* Shown on hover. The ranking is only defensible if the user can
              see how the number was reached. */}
          <div className="score-popover" role="tooltip">
            <div className="score-popover-head">
              How this score was calculated
            </div>
            {parts.map((p) => (
              <div className="score-popover-row" key={p.key}>
                <span className={`score-popover-key ${p.cls}`} />
                <span className="score-popover-label">{p.label}</span>
                <span className="score-popover-value">
                  {Number(p.got).toFixed(1)} / {p.max}
                </span>
              </div>
            ))}
            <div className="score-popover-total">
              <span>Total</span>
              <span>{value.toFixed(1)} / 100</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
/**
 * Inline price history chart.
 *
 * A raw count of observations tells a shopper nothing. Plotting the recorded
 * prices shows the direction of movement, which is what actually informs a
 * buying decision. Drawn as SVG rather than through a charting library so that
 * it adds no dependency and renders inside a table cell.
 */
function PriceSparkline({ history }) {
  if (!history || history.length < 2) {
    return <span className="history-empty">Tracking started</span>;
  }

  const prices = history.map((point) => Number(point.price)).filter(Boolean);
  if (prices.length < 2) {
    return <span className="history-empty">Tracking started</span>;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const W = 92;
  const H = 28;

  const points = prices
    .map((price, i) => {
      const x = (i / (prices.length - 1)) * W;
      const y = H - ((price - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = prices[0];
  const last = prices[prices.length - 1];
  const changePercent = Math.round(((last - first) / first) * 100);

  const tone = last < first ? "down" : last > first ? "up" : "flat";
  const arrow = tone === "down" ? "\u2193" : tone === "up" ? "\u2191" : "\u2192";

  const fmt = (d) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div
      className={`sparkline sparkline-${tone}`}
      title={`${prices.length} recorded prices, ${fmt(history[0].recordedAt)} to ${fmt(history[history.length - 1].recordedAt)}`}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <polyline points={points} fill="none" strokeWidth="1.8" />
        <circle cx={W} cy={H - ((last - min) / range) * H} r="2.6" />
      </svg>
      <span className="sparkline-label">
        {arrow} {Math.abs(changePercent)}% since first seen
      </span>
      <span className="sparkline-range">
        Low {min.toLocaleString()} &middot; High {max.toLocaleString()}
      </span>
    </div>
  );
}
function ComparisonTable({ products }) {
  const navigate = useNavigate();

  if (!products || products.length === 0) return null;

  const sorted = [...products].sort((a, b) => a.price - b.price);
  // A "best deal" only means something when there is more than one offer for
  // the same product. Marking the top score in a single-offer table implied a
  // comparison that had not taken place.
  const bestId =
    sorted.length > 1
      ? [...sorted].sort(
          (a, b) => Number(b.dealScore || 0) - Number(a.dealScore || 0)
        )[0]._id
      : null;

  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Deal Score</th>
            <th>Recommendation</th>
            <th>Availability</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((product) => {
            const isBest = product._id === bestId;
            const analysis = product.discountAnalysis || {};
            const rec = RECOMMENDATION_LABELS[product.recommendation?.action] ||
              RECOMMENDATION_LABELS.NO_HISTORY;
            const disc = DISCOUNT_LABELS[analysis.classification] || { text: "", cls: "" };
            const historyCount = (product.priceHistory || []).length;

            return (
              <tr key={product._id} className={isBest ? "best-deal-row" : ""}>
                <td>
                  <div className="store-cell">
                    {isBest && <span className="table-best-badge">Best Deal</span>}
                    <div className="store-logo-wrapper">
                      <PlatformLogo platform={product.platform} />
                      <div
                        className="store-logo-fallback"
                        style={{
                          display: "none",
                          background: PLATFORM_COLORS[canonical(product.platform)] || "#1a73e8",
                        }}
                      >
                        {product.platform ? product.platform.charAt(0).toUpperCase() : "S"}
                      </div>
                    </div>
                    <span className="store-name">{product.platform}</span>
                  </div>
                </td>

                <td>
                  <div className="price-cell">PKR {product.price.toLocaleString()}</div>
                  {product.originalPrice > product.price && (
                    <span className="table-original">
                      PKR {product.originalPrice.toLocaleString()}
                    </span>
                  )}
                </td>

                <td>
                  <div className="discount-cell">
                    {analysis.claimedDiscountPercent > 0 && (
                      <span className="table-discount">
                        {Math.round(analysis.claimedDiscountPercent)}% OFF
                      </span>
                    )}
                    {disc.text && (
                      <span
                        className={`disc-badge ${disc.cls}`}
                        title={analysis.reason || ""}
                      >
                        {analysis.isFakeDiscount ? "\u26A0 " : ""}
                        {disc.text}
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  <ScoreCell
                    score={product.dealScore}
                    breakdown={product.scoreBreakdown}
                    weights={product.scoreWeights}
                  />
                </td>

                <td>
                  <div className="rec-cell">
                    <span
                      className={`rec-pill ${rec.cls}`}
                      title={product.recommendation?.reason || ""}
                    >
                      {rec.text}
                    </span>
                    <PriceSparkline history={product.priceHistory} />
                  </div>
                </td>

                <td>
                  <div className="availability-cell">
                    <span className={product.inStock ? "in-stock" : "low-stock"}>
                      &#9679; {product.inStock ? "In Stock" : "Out of Stock"}
                    </span>
                    <span className="updated-date">
                      Updated:{" "}
                      {new Date(product.lastScrapedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </td>

                <td>
                  <button
                    className="view-deal-btn"
                    onClick={() => navigate(`/product/${product._id}`)}
                  >
                    View Deal
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="table-footer">
        Deal Score combines price competitiveness (60), platform trust (20), data freshness (10)
        and availability (10). Hover any score to see its breakdown.
      </div>
    </div>
  );
}

export default ComparisonTable;