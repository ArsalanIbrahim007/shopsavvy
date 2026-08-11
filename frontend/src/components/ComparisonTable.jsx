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

  const tooltip = breakdown
    ? `Price ${breakdown.price}/${weights?.price ?? 60} · ` +
    `Trust ${breakdown.trust}/${weights?.trust ?? 20} · ` +
    `Freshness ${breakdown.freshness}/${weights?.freshness ?? 10} · ` +
    `Availability ${breakdown.availability}/${weights?.availability ?? 10}`
    : "";

  return (
    <div className="score-cell" title={tooltip}>
      <div className={`score-value ${tone}`}>{value.toFixed(1)}</div>
      {breakdown && (
        <div className="score-bar" aria-hidden="true">
          <span className="seg seg-price" style={{ flexGrow: breakdown.price || 0.01 }} />
          <span className="seg seg-trust" style={{ flexGrow: breakdown.trust || 0.01 }} />
          <span className="seg seg-fresh" style={{ flexGrow: breakdown.freshness || 0.01 }} />
          <span className="seg seg-avail" style={{ flexGrow: breakdown.availability || 0.01 }} />
        </div>
      )}
    </div>
  );
}

function ComparisonTable({ products }) {
  const navigate = useNavigate();

  if (!products || products.length === 0) return null;

  const sorted = [...products].sort((a, b) => a.price - b.price);
  const topScore = Math.max(...sorted.map((p) => Number(p.dealScore || 0)));

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
            const isBest = Number(product.dealScore || 0) === topScore;
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
                    <span className="rec-meta">
                      {historyCount > 0
                        ? `${historyCount} price points`
                        : "no history yet"}
                    </span>
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