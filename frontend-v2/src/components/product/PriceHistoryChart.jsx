// PriceHistoryChart.jsx — every store's price over time for one product, on shared axes, as step lines (a price
// holds until it changes). The shopper picks 30 days, 90 days or all time and can hide a store's lines; the
// listing they opened is drawn thicker and summarised underneath (lowest, highest, change). With too little
// history it says so instead of drawing something misleading. The recorded prices are also available as a table.

import { useId, useState } from "react";

import { DEFAULT_RANGE, RANGES, buildSeries, chartModel, historyPoints, historyStats } from "../../lib/history.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { canonicalPlatform, platformColor, platformName } from "../../lib/platforms.js";
import "./product.css";

export default function PriceHistoryChart({ offers, currentId, now }) {
  const uid = useId();
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [hidden, setHidden] = useState([]); // canonical store ids

  const current = offers.find((offer) => offer._id === currentId) ?? offers[0];
  const allSeries = buildSeries(offers, range, { currentId, now });
  const visible = allSeries.filter((s) => !hidden.includes(canonicalPlatform(s.platform)));
  const model = chartModel(visible);
  const stores = [...new Map(allSeries.map((s) => [canonicalPlatform(s.platform), s.platform])).entries()];

  const ownPoints = historyPoints(current);
  const stats = historyStats(ownPoints);

  function toggleStore(id) {
    setHidden((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  return (
    <div className="history">
      <div className="history__controls">
        <div role="group" aria-label="Time range" className="history__ranges">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className="chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {stores.length > 1 && (
          <div role="group" aria-label="Stores shown" className="history__legend">
            {stores.map(([id, platform]) => (
              <button key={id} type="button" className="chip history__store" aria-pressed={!hidden.includes(id)} onClick={() => toggleStore(id)}>
                <span className="history__swatch" style={{ background: platformColor(platform) }} aria-hidden="true" />
                {platformName(platform)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!model ? (
        <p className="history__empty card">
          {ownPoints.length === 1
            ? `Tracking began ${formatDate(ownPoints[0].at)}. A chart appears once prices have been recorded on more than one day.`
            : allSeries.length === 0
              ? "No price history has been recorded for these offers in this period yet."
              : "Not enough history in this period to draw a chart yet. Try a longer range."}
        </p>
      ) : (
        <svg className="history__chart" viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`}>
          <title id={`${uid}-t`}>Price history</title>
          <desc id={`${uid}-d`}>{`Prices from ${formatDate(model.from)} to ${formatDate(model.to)}, between ${formatPrice(model.min)} and ${formatPrice(model.max)}.`}</desc>
          {[model.min, model.max].map((value) => (
            <g key={value}>
              <line x1={model.pad.left} x2={model.width - model.pad.right} y1={model.y(value)} y2={model.y(value)} className="history__grid" />
              <text x={model.pad.left - 8} y={model.y(value) + 4} textAnchor="end" className="history__axis">{value.toLocaleString("en-US")}</text>
            </g>
          ))}
          {model.lines.map((line) => {
            const series = visible.find((s) => s.id === line.id);
            return (
              <g key={line.id} className={line.isCurrent ? "history__line history__line--current" : "history__line"} style={{ color: platformColor(series.platform) }}>
                <path d={line.path} fill="none" />
                {line.isCurrent && line.dots.map((dot) => (
                  <circle key={dot.at.getTime()} cx={dot.cx} cy={dot.cy} r="3.5">
                    <title>{`${line.name}: ${formatPrice(dot.price)} on ${formatDate(dot.at)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          <text x={model.pad.left} y={model.height - 8} className="history__axis">{formatDate(model.from)}</text>
          <text x={model.width - model.pad.right} y={model.height - 8} textAnchor="end" className="history__axis">{formatDate(model.to)}</text>
        </svg>
      )}

      {stats && (
        <p className="history__stats">
          <span>{platformName(current.platform)}, the listing you opened: </span>
          <span>lowest <strong className="price">{formatPrice(stats.min)}</strong></span>
          <span>highest <strong className="price">{formatPrice(stats.max)}</strong></span>
          {stats.count > 1 && (
            <span>
              change <strong>{stats.changePercent > 0 ? "+" : ""}{stats.changePercent}%</strong> over {stats.count} recorded prices
            </span>
          )}
        </p>
      )}

      {ownPoints.length > 0 && (
        <details className="history__table">
          <summary>Show the recorded prices</summary>
          <table>
            <thead><tr><th scope="col">Date</th><th scope="col" className="num">Price</th></tr></thead>
            <tbody>
              {[...ownPoints].reverse().map((point) => (
                <tr key={point.at.getTime()}><td>{formatDate(point.at)}</td><td className="num price">{formatPrice(point.price)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
