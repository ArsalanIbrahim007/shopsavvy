const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 64 };

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Price over time for one offer, drawn as SVG so it adds no dependency.
 *
 * History is recorded once per day (or when the price changes), so a product
 * seen for the first time today has a single point. That is shown as what it
 * is, rather than as an empty or invented chart.
 */
function PriceHistoryChart({ history }) {
  const points = (history || [])
    .map((p) => ({ price: Number(p.price), at: new Date(p.recordedAt) }))
    .filter((p) => p.price > 0 && !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at - b.at);

  if (points.length < 2) {
    return (
      <div className="history-chart-empty">
        {points.length === 1
          ? `Tracking began ${fmtDate(points[0].at)}. A chart appears once this price has been recorded on more than one day.`
          : "No price history has been recorded for this listing yet."}
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const t0 = points[0].at.getTime();
  const tSpan = points[points.length - 1].at.getTime() - t0 || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (p) => PAD.left + ((p.at.getTime() - t0) / tSpan) * innerW;
  const yOf = (price) => PAD.top + innerH - ((price - min) / span) * innerH;

  // Prices hold until they change, so draw steps rather than slopes between
  // observations: a slope would imply a gradual fall that never happened.
  const path = points
    .map((p, i) => (i === 0 ? `M${x(p)},${yOf(p.price)}` : `H${x(p)}V${yOf(p.price)}`))
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const change = Math.round(((last.price - first.price) / first.price) * 100);
  const tone = last.price < first.price ? "down" : last.price > first.price ? "up" : "flat";

  return (
    <div className={`history-chart history-chart-${tone}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price history chart">
        {[min, max].map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              className="history-gridline"
            />
            <text x={PAD.left - 8} y={yOf(v) + 4} textAnchor="end" className="history-axis">
              {v.toLocaleString()}
            </text>
          </g>
        ))}
        <path d={path} fill="none" className="history-line" />
        {points.map((p) => (
          <circle key={p.at.getTime()} cx={x(p)} cy={yOf(p.price)} r="3.5" className="history-dot">
            <title>{`PKR ${p.price.toLocaleString()} on ${fmtDate(p.at)}`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 8} className="history-axis">
          {fmtDate(first.at)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="history-axis">
          {fmtDate(last.at)}
        </text>
      </svg>
      <div className="history-chart-stats">
        <span>
          Lowest <strong>PKR {min.toLocaleString()}</strong>
        </span>
        <span>
          Highest <strong>PKR {max.toLocaleString()}</strong>
        </span>
        <span>
          Change{" "}
          <strong>
            {change > 0 ? "+" : ""}
            {change}%
          </strong>{" "}
          over {points.length} recorded prices
        </span>
      </div>
    </div>
  );
}

export default PriceHistoryChart;
