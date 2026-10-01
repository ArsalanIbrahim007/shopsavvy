// PriceHistoryChart.jsx — every store's price over time for one product, on shared labelled axes, as step lines
// (a price holds until it changes). The shopper picks 30 days, 90 days or all time and can hide a store's lines;
// the listing they opened is drawn thicker and summarised underneath (lowest, highest, change). With too little
// history it says so instead of drawing something misleading. The recorded prices are also available as a table.
//
// Hover (or touch, or the arrow keys) reads the chart: a vertical guide follows the pointer, a dot marks each
// store's price on that date, and a box lists the date and what every store charged, with the store nearest the
// pointer in bold. The chart is drawn at the width it is shown at, so its text stays a readable size on a phone.

import { useEffect, useId, useRef, useState } from "react";

import { DEFAULT_RANGE, RANGES, buildSeries, chartModel, historyPoints, historyStats, hoverRows } from "../../lib/history.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { canonicalPlatform, platformColor, platformName } from "../../lib/platforms.js";
import "./product.css";

const DAY_MS = 24 * 3600 * 1000;
const FALLBACK_WIDTH = 720; // before the first measurement, and where nothing can be measured (tests)
const NARROW = 520;

/** The width of an element, kept up to date as it is resized. */
function useElementWidth(ref) {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const measured = Math.round(element.clientWidth);
      if (measured > 0) setWidth(Math.max(measured, 280));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function PriceHistoryChart({ offers, currentId, now }) {
  const uid = useId();
  const plotRef = useRef(null);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [hidden, setHidden] = useState([]); // canonical store ids
  const [hover, setHover] = useState(null); // { time: ms, y: px | null } while the chart is being read
  const width = useElementWidth(plotRef);

  const current = offers.find((offer) => offer._id === currentId) ?? offers[0];
  const allSeries = buildSeries(offers, range, { currentId, now });
  const visible = allSeries.filter((s) => !hidden.includes(canonicalPlatform(s.platform)));
  const narrow = width < NARROW;
  const model = chartModel(visible, { width, height: narrow ? 300 : 340, xTarget: narrow ? 4 : 6 });
  const stores = [...new Map(allSeries.map((s) => [canonicalPlatform(s.platform), s.platform])).entries()];

  const ownPoints = historyPoints(current);
  const stats = historyStats(ownPoints);

  function toggleStore(id) {
    setHidden((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  // ---- reading the chart ----
  const inRange = hover && model && hover.time >= model.from.getTime() && hover.time <= model.to.getTime() ? hover : null;
  const rows = inRange ? hoverRows(visible, inRange.time) : [];
  const nearest = inRange?.y != null && rows.length > 0
    ? rows.reduce((best, row) => (Math.abs(model.y(row.price) - inRange.y) < Math.abs(model.y(best.price) - inRange.y) ? row : best))
    : null;
  const readout = inRange && rows.length > 0
    ? `${formatDate(new Date(inRange.time))}: ${rows.map((row) => `${row.name} ${formatPrice(row.price)}`).join(", ")}`
    : "";

  function pointerMove(event) {
    if (!model) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const scale = model.width / box.width; // the drawing is 1 unit per pixel, but stay right if CSS resizes it
    const px = (event.clientX - box.left) * scale;
    const py = (event.clientY - box.top) * scale;
    setHover({ time: model.timeAt(px).getTime(), y: py });
  }

  function keyDown(event) {
    if (!model) return;
    const step = event.shiftKey ? 7 * DAY_MS : DAY_MS;
    const start = model.from.getTime();
    const end = model.to.getTime();
    const at = hover?.time ?? end;
    let next = null;
    if (event.key === "ArrowLeft") next = at - step;
    else if (event.key === "ArrowRight") next = at + step;
    else if (event.key === "Home") next = start;
    else if (event.key === "End") next = end;
    else if (event.key === "Escape") {
      setHover(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setHover({ time: Math.min(Math.max(next, start), end), y: null });
  }

  const guideX = inRange ? model.x(new Date(inRange.time)) : 0;
  const boxOnLeft = inRange && guideX > model.width / 2; // keep the box inside the chart on either side of the middle

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
                <span className="history__swatch" style={{ "--store": platformColor(platform) }} aria-hidden="true" />
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
      ) : null}

      {/* Always rendered so its width can be measured; it is empty while there is nothing to draw. */}
      <div
        ref={plotRef}
        className="history__plot"
        hidden={!model}
        tabIndex={model ? 0 : -1}
        role="group"
        aria-label="Price history chart. Use the left and right arrow keys to move through the dates."
        onKeyDown={keyDown}
        onBlur={() => setHover(null)}
      >
        {model && (
          <>
            <svg
              className="history__chart"
              width={model.width}
              height={model.height}
              viewBox={`0 0 ${model.width} ${model.height}`}
              role="img"
              aria-labelledby={`${uid}-t`}
              aria-describedby={`${uid}-d`}
              onPointerMove={pointerMove}
              onPointerDown={pointerMove}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") setHover(null); }}
            >
              <title id={`${uid}-t`}>Price history</title>
              <desc id={`${uid}-d`}>{`Prices from ${formatDate(model.from)} to ${formatDate(model.to)}, between ${formatPrice(model.min)} and ${formatPrice(model.max)}.`}</desc>

              {/* gridlines and the price scale (left) */}
              {model.yTicks.map((tick) => (
                <g key={tick.value}>
                  <line x1={model.pad.left} x2={model.width - model.pad.right} y1={tick.y} y2={tick.y} className="history__grid" />
                  <text x={model.pad.left - 10} y={tick.y + 4} textAnchor="end" className="history__axis">{tick.label}</text>
                </g>
              ))}

              {/* the date scale (bottom) */}
              {model.xTicks.map((tick) => (
                <g key={tick.at.getTime()}>
                  <line x1={tick.x} x2={tick.x} y1={model.height - model.pad.bottom} y2={model.height - model.pad.bottom + 5} className="history__tick" />
                  <text x={tick.x} y={model.height - model.pad.bottom + 20} textAnchor="middle" className="history__axis">{tick.label}</text>
                </g>
              ))}

              {/* the two axes and their titles */}
              <line x1={model.pad.left} x2={model.pad.left} y1={model.pad.top} y2={model.height - model.pad.bottom} className="history__axis-line" />
              <line x1={model.pad.left} x2={model.width - model.pad.right} y1={model.height - model.pad.bottom} y2={model.height - model.pad.bottom} className="history__axis-line" />
              <text
                transform={`translate(16 ${model.pad.top + (model.height - model.pad.top - model.pad.bottom) / 2}) rotate(-90)`}
                textAnchor="middle"
                className="history__axis-title"
              >
                Price (PKR)
              </text>
              <text x={model.pad.left + (model.width - model.pad.left - model.pad.right) / 2} y={model.height - 8} textAnchor="middle" className="history__axis-title">
                Date
              </text>

              {model.lines.map((line) => {
                const series = visible.find((s) => s.id === line.id);
                return (
                  <g key={line.id} className={line.isCurrent ? "history__line history__line--current" : "history__line"} style={{ "--store": platformColor(series.platform) }}>
                    <path d={line.path} fill="none" />
                    {line.isCurrent && line.dots.map((dot) => <circle key={dot.at.getTime()} cx={dot.cx} cy={dot.cy} r="3.5" />)}
                  </g>
                );
              })}

              {/* the guide and a dot on each store's price at the pointer */}
              {inRange && rows.length > 0 && (
                <g className="history__guide" pointerEvents="none">
                  <line x1={guideX} x2={guideX} y1={model.pad.top} y2={model.height - model.pad.bottom} className="history__crosshair" />
                  {rows.map((row) => (
                    <g key={row.id} className="history__marker-group" style={{ "--store": platformColor(row.platform) }}>
                      <circle cx={guideX} cy={model.y(row.price)} r={row === nearest ? 6 : 4.5} className="history__marker" />
                    </g>
                  ))}
                </g>
              )}
            </svg>

            {inRange && rows.length > 0 && (
              <div
                className="history__tooltip"
                style={{ top: model.pad.top + 4, [boxOnLeft ? "right" : "left"]: boxOnLeft ? model.width - guideX + 12 : guideX + 12 }}
                aria-hidden="true"
              >
                <p className="history__tooltip-date">{formatDate(new Date(inRange.time))}</p>
                {rows.map((row) => (
                  <p key={row.id} className={row === nearest ? "history__tooltip-row is-near" : "history__tooltip-row"}>
                    <span className="history__tooltip-store">
                      <span className="history__swatch" style={{ "--store": platformColor(row.platform) }} />
                      {row.name}
                    </span>
                    <span className="price">{formatPrice(row.price)}</span>
                  </p>
                ))}
              </div>
            )}
            {/* the same reading for screen readers, announced as the arrow keys move */}
            <p className="visually-hidden" aria-live="polite">{readout}</p>
          </>
        )}
      </div>

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
