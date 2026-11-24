// PriceOutlook.jsx — "Wait or buy?" drawn rather than written: the verdict, a gauge of where today's price sits between the lowest and
// highest it has been, a chart of the best price day by day, four figures, how much history it rests on, and how prices at the stores
// we track have moved. It is not a forecast and says so. With too little history it shows how far the product is from enough, and no
// gauge or chart (nothing honest to draw). Shows nothing when the server sent no outlook. The numbers come from lib/outlook.js.
//
// Every picture has a text equivalent: the gauge and chart carry a spoken summary, the meters are progress bars, and the figures are
// plain text, so nothing depends on colour or on seeing the drawing.

import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useElementWidth } from "../../hooks/useElementWidth.js";
import { bestOfferOn, chartFor, describeOutlook } from "../../lib/outlook.js";
import { formatDate, formatNumber, formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { StoreMark } from "../StoreLogo.jsx";
import "./product.css";

const ARROWS = { up: "▲", down: "▼", flat: "■" };
const TREND_WORDS = { up: "up", down: "down", flat: "unchanged" };

function Gauge({ gauge, tone }) {
  const spoken = `Today's best price is ${formatPrice(gauge.current)}. The lowest it has been is ${formatPrice(gauge.low)}, the highest ${formatPrice(gauge.high)}, and its usual price ${formatPrice(gauge.usual)}. ${gauge.caption}.`;
  return (
    <figure className="outlook-gauge">
      <figcaption className="outlook-visual-title">Where today's price sits</figcaption>
      {/* the figures sit on the drawing itself: today above its marker, the usual price below its tick, the range at the ends */}
      <div className="outlook-gauge__track">
        <span className="outlook-gauge__tag outlook-gauge__tag--now price" style={{ left: `clamp(72px, ${gauge.currentPct}%, calc(100% - 72px))` }} aria-hidden="true">
          Today {formatPrice(gauge.current)}
        </span>
        <div className="outlook-gauge__bar" role="img" aria-label={spoken}>
          <span className="outlook-gauge__fill" style={{ width: `${gauge.currentPct}%` }} />
          <span className="outlook-gauge__usual" style={{ left: `${gauge.usualPct}%` }} />
          <span className={`outlook-gauge__now outlook-gauge__now--${tone}`} style={{ left: `${gauge.currentPct}%` }} />
        </div>
        <span className="outlook-gauge__tag outlook-gauge__tag--usual price" style={{ left: `clamp(72px, ${gauge.usualPct}%, calc(100% - 72px))` }} aria-hidden="true">
          Usual {formatPrice(gauge.usual)}
        </span>
      </div>
      <div className="outlook-gauge__scale price" aria-hidden="true">
        <span>{formatPrice(gauge.low)}</span>
        <span>{formatPrice(gauge.high)}</span>
      </div>
    </figure>
  );
}

/** "3% below its usual price", "its usual price", "5% above its usual price" */
function versusUsual(price, usual) {
  if (!(usual > 0)) return null;
  const pct = Math.round(((price - usual) / usual) * 100);
  if (pct === 0) return "about its usual price";
  return `${Math.abs(pct)}% ${pct < 0 ? "below" : "above"} its usual price`;
}

/**
 * The card for one day of the chart (2026-11-21): the date, the best price, the store that had it, and how it stood against the
 * product's usual price. Where a comparison site's card says what the price was, this one also says whether it was a good day.
 */
function DayCard({ dot, offers, usual, left, top, below = false }) {
  const offer = bestOfferOn(offers, dot.at, dot.price);
  const against = versusUsual(dot.price, usual);
  return (
    <div className={below ? "outlook-day outlook-day--below" : "outlook-day"} style={{ left: `${left}%`, top }} aria-hidden="true">
      <p className="outlook-day__date">{formatDate(dot.at)}</p>
      <p className="outlook-day__price price">{formatPrice(dot.price)}</p>
      {offer && (
        <p className="outlook-day__store small"><StoreMark platform={offer.platform} size={16} /> {platformName(offer.platform)}</p>
      )}
      {against && <p className={`outlook-day__vs small ${dot.price <= usual ? "is-good" : "is-high"}`}>{against}</p>}
    </div>
  );
}

function Chart({ outlook, offers }) {
  const holder = useRef(null);
  const width = useElementWidth(holder, 640);
  const model = chartFor(outlook, { width, height: width < 460 ? 230 : 300 });
  // the area under the line, faded to nothing at the foot: the shape of the price at a glance (2026-11-21)
  const area = model && model.dots.length > 1
    ? `${model.path} L ${model.dots.at(-1).cx} ${model.height - model.pad.bottom} L ${model.dots[0].cx} ${model.height - model.pad.bottom} Z`
    : null;
  const [active, setActive] = useState(null); // the index of the day being looked at, by pointer or keyboard

  const dots = model?.dots ?? [];
  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * model.width;
    let nearest = 0;
    dots.forEach((dot, i) => { if (Math.abs(dot.cx - x) < Math.abs(dots[nearest].cx - x)) nearest = i; });
    setActive(nearest);
  };
  const step = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setActive((i) => Math.max(0, Math.min(dots.length - 1, (i ?? dots.length - 1) + (event.key === "ArrowRight" ? 1 : -1))));
  };
  const shown = active !== null ? dots[active] : null;
  const shownStore = shown ? bestOfferOn(offers, shown.at, shown.price) : null;

  return (
    <figure className="outlook-chart" ref={holder}>
      <figcaption className="outlook-chart__head">
        <span className="outlook-visual-title">The best price, day by day</span>
        <ul className="outlook-legend outlook-legend--chart" aria-hidden="true">
          <li><span className="outlook-key outlook-key--line" /> Best</li>
          <li><span className="outlook-key outlook-key--ref-usual" /> Usual</li>
          <li><span className="outlook-key outlook-key--ref-low" /> Low / high</li>
        </ul>
      </figcaption>
      {model ? (
        <div className="outlook-chart__plot">
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`} width={model.width} height={model.height} role="img"
          aria-label={`${model.description} Move along it with the arrow keys to read each day.`}
          className="outlook-chart__svg" tabIndex={0}
          onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)} onKeyDown={step} onBlur={() => setActive(null)}
        >
          {model.yTicks.map((tick) => (
            <g key={tick.value}>
              <line className="history__grid" x1={model.pad.left} x2={model.width - model.pad.right} y1={tick.y} y2={tick.y} />
              <text className="history__axis" x={model.pad.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">{tick.label}</text>
            </g>
          ))}
          {model.xTicks.map((tick) => (
            <text key={tick.at.getTime()} className="history__axis" x={tick.x} y={model.height - model.pad.bottom + 20} textAnchor="middle">{tick.label}</text>
          ))}
          {model.references.map((ref) => (
            <line key={ref.id} className={`outlook-chart__ref outlook-chart__ref--${ref.id}`} x1={model.pad.left} x2={model.width - model.pad.right} y1={ref.y} y2={ref.y} />
          ))}
          <defs>
            <linearGradient id="outlook-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="outlook-chart__area-top" />
              <stop offset="100%" className="outlook-chart__area-foot" />
            </linearGradient>
          </defs>
          {area && <path className="outlook-chart__area" d={area} fill="url(#outlook-area)" />}
          <path className="outlook-chart__line" d={model.path} fill="none" pathLength="1" />
          {model.dots.slice(0, -1).map((dot) => <circle key={dot.at.getTime()} className="outlook-chart__dot" cx={dot.cx} cy={dot.cy} r="3" />)}
          <circle className="outlook-chart__today-ring" cx={model.today.cx} cy={model.today.cy} r="9" />
          <circle className="outlook-chart__today" cx={model.today.cx} cy={model.today.cy} r="5" />
          {shown && (
            <g className="outlook-chart__focus">
              <line x1={shown.cx} x2={shown.cx} y1={model.pad.top} y2={model.height - model.pad.bottom} />
              <circle cx={shown.cx} cy={shown.cy} r="6" />
            </g>
          )}
        </svg>
        {shown && <DayCard dot={shown} offers={offers} usual={outlook.stats?.usual} left={(shown.cx / model.width) * 100} top={shown.cy < 120 ? shown.cy + 14 : shown.cy - 12} below={shown.cy < 120} />}
        {/* the same, in words, for a screen reader moving with the arrow keys */}
        <p className="visually-hidden" aria-live="polite">
          {shown ? `${formatDate(shown.at)}: ${formatPrice(shown.price)}${shownStore ? ` at ${platformName(shownStore.platform)}` : ""}` : ""}
        </p>
        </div>
      ) : (
        <p className="muted">Not enough days of records to draw this.</p>
      )}
    </figure>
  );
}

/**
 * The panel's four headline figures (2026-11-21), each a card with one large number: today's best price and its store, the lowest and
 * highest the best price has been and when, and where today stands against the usual price. The card a shopper acts on (today's) is
 * outlined; low and high are coloured, so the range reads at a glance.
 */
function StatCards({ outlook, offers, tiles }) {
  const { stats, series } = outlook;
  const dayOf = (point) => new Date(`${point.day}T12:00:00+05:00`);
  const when = (price) => {
    const point = [...series].reverse().find((p) => p.price === price);
    return point ? formatDate(dayOf(point)) : null;
  };
  const latest = series.at(-1);
  const today = (latest && bestOfferOn(offers, dayOf(latest), stats.current)) ?? offers.find((o) => o.price === stats.current) ?? null;
  const usual = tiles.find((tile) => tile.id === "usual");
  const cards = [
    { id: "today", label: "Today's best", value: formatPrice(stats.current), sub: today ? <><StoreMark platform={today.platform} size={16} /> {platformName(today.platform)}</> : null, tone: "today" },
    { id: "low", label: "Lowest recorded", value: formatPrice(stats.low), sub: when(stats.low), tone: "good" },
    { id: "high", label: "Highest recorded", value: formatPrice(stats.high), sub: when(stats.high), tone: "bad" },
    usual && { id: "usual", label: "Versus its usual price", value: <>{usual.trend && <span className="outlook-stat__arrow" aria-hidden="true">{ARROWS[usual.trend]}</span>}{usual.value}</>, sub: `Usual ${formatPrice(stats.usual)}`, tone: usual.tone },
  ].filter(Boolean);
  return (
    <ul className="outlook-stats" aria-label="The best price in figures">
      {cards.map((card) => (
        <li key={card.id} className={`outlook-stat outlook-stat--${card.tone}`}>
          <span className="outlook-stat__label">{card.label}</span>
          <span className="outlook-stat__value price">{card.value}</span>
          {card.sub && <span className="outlook-stat__sub small">{card.sub}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The rest, as one row of small facts under the chart: the last week, the last change, how long it has been tracked. */
function Facts({ tiles }) {
  const rest = tiles.filter((tile) => tile.id !== "usual");
  if (rest.length === 0) return null;
  return (
    <ul className="outlook-facts" aria-label="More about the best price">
      {rest.map((tile) => (
        <li key={tile.id} className={`outlook-fact outlook-fact--${tile.tone}`} title={tile.hint || undefined}>
          <span className="muted">{tile.label}</span>{" "}
          <strong>
            {tile.trend && <span className="outlook-stat__arrow" aria-hidden="true">{ARROWS[tile.trend]}</span>}
            {tile.value}
            {tile.trend && <span className="visually-hidden"> ({TREND_WORDS[tile.trend]})</span>}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function Evidence({ evidence }) {
  return (
    <section className="outlook-evidence" aria-label="How much history this rests on">
      <h3 className="outlook-visual-title">{evidence.title}</h3>
      {evidence.meters.map((meter) => (
        <div key={meter.id} className="outlook-meter">
          <div className="outlook-meter__head">
            <span id={`meter-${meter.id}`}>{meter.label}</span>
            <span className="small muted">{meter.reached ? `${formatNumber(meter.value)} · enough ✓` : `${formatNumber(meter.value)} of ${formatNumber(meter.target)} needed`}</span>
          </div>
          <div className={`outlook-meter__track${meter.reached ? " is-full" : ""}`} role="progressbar" aria-labelledby={`meter-${meter.id}`} aria-valuemin={0} aria-valuemax={meter.target} aria-valuenow={Math.min(meter.value, meter.target)} aria-valuetext={`${meter.value} of ${meter.target}`}>
            <span className="outlook-meter__fill" style={{ width: `${Math.round(meter.share * 100)}%` }} />
          </div>
        </div>
      ))}
      {evidence.note && <p className="small muted">{evidence.note}</p>}
    </section>
  );
}

function Movement({ movement }) {
  const spoken = `Of ${movement.total} week-long comparisons, ${movement.fell} fell by 3% or more, ${movement.steady} stayed within 3% and ${movement.rose} rose by 3% or more.`;
  return (
    <section className="outlook-movement" aria-label="How prices have moved across the stores we track">
      <h3 className="outlook-visual-title">How prices move at the stores we track</h3>
      <div className="outlook-split" role="img" aria-label={spoken}>
        {movement.fellShare > 0 && <span className="outlook-split__part outlook-split__part--fell" style={{ flexGrow: movement.fell }} />}
        {movement.steadyShare > 0 && <span className="outlook-split__part outlook-split__part--steady" style={{ flexGrow: movement.steady }} />}
        {movement.roseShare > 0 && <span className="outlook-split__part outlook-split__part--rose" style={{ flexGrow: movement.rose }} />}
      </div>
      <ul className="outlook-legend">
        <li><span className="outlook-key outlook-key--fell" aria-hidden="true" /> Fell 3%+ <strong>{movement.fellShare}%</strong> <span className="muted">({formatNumber(movement.fell)})</span></li>
        <li><span className="outlook-key outlook-key--steady" aria-hidden="true" /> Within 3% <strong>{movement.steadyShare}%</strong> <span className="muted">({formatNumber(movement.steady)})</span></li>
        <li><span className="outlook-key outlook-key--rose" aria-hidden="true" /> Rose 3%+ <strong>{movement.roseShare}%</strong> <span className="muted">({formatNumber(movement.rose)})</span></li>
      </ul>
      <p className="small muted">
        {formatNumber(movement.total)} week-long comparisons across {movement.stores} {movement.stores === 1 ? "store" : "stores"}{movement.period ? `, ${movement.period}` : ""}.
        {movement.concentration ? ` ${movement.concentration}` : ""}
      </p>
    </section>
  );
}

export default function PriceOutlook({ outlook, offers = [] }) {
  const view = describeOutlook(outlook);
  if (!view) return null;
  const drawsChart = Array.isArray(outlook.series) && outlook.series.length >= 2 && view.tiles.length > 0;

  return (
    <section className="product-section" aria-labelledby="outlook-heading">
      <h2 id="outlook-heading">Wait or buy?</h2>
      {/* The verdict on one line; what it rests on opens below it. Open from the start when there is a picture to show. */}
      <details className={`outlook card outlook--${view.tone}`} open={Boolean(view.gauge) || undefined}>
        <summary className="outlook__head">
          <span className="outlook__glyph" aria-hidden="true">{view.glyph}</span>
          <div className="outlook__verdict">
            <p className="outlook__label">{view.label}</p>
            <p className="outlook__headline">{view.headline}</p>
          </div>
          {view.early && <span className="badge badge-neutral" title="Based on less than four weeks of price records">Early estimate</span>}
          <span className="outlook__toggle small" aria-hidden="true">Details</span>
        </summary>

        <div className="outlook__body">
          {view.detail && <p className="muted">{view.detail}</p>}

          {/* (2026-11-21) the four figures as cards on top, the chart across the whole width, the rest as a row of facts; the
              gauge only when there is no chart to show where today's price sits */}
          {view.tiles.length > 0 && outlook.stats && <StatCards outlook={outlook} offers={offers} tiles={view.tiles} />}
          {drawsChart && <Chart outlook={outlook} offers={offers} />}
          {!drawsChart && view.gauge && <Gauge gauge={view.gauge} tone={view.tone} />}
          {view.tiles.length > 0 && <Facts tiles={view.tiles} />}

          {/* what it rests on, for whoever wants it: closed, unless that is all there is to show */}
          {(view.evidence || view.movement) && (
            <details className="outlook__more" open={!view.gauge && !drawsChart ? true : undefined}>
              <summary className="small">What this rests on</summary>
              <div className="outlook__foot">
                {view.evidence && <Evidence evidence={view.evidence} />}
                {view.movement && <Movement movement={view.movement} />}
              </div>
            </details>
          )}

          <p className="small muted">
            This is not a forecast. <Link to="/honest-prices">How much to trust it</Link>
          </p>
        </div>
      </details>
    </section>
  );
}
