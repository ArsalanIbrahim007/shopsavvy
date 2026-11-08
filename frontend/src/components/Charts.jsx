// Charts.jsx — the small charts of the "How we keep prices honest" page, drawn in SVG and CSS with the theme's tokens. Each one is a
// picture of a table that sits beside it (the table is what a screen reader reads, and what "Show the numbers" opens), so every chart
// is aria-hidden. They draw themselves once, when scrolled into view (useInView), and appear at once with reduced motion.

import { useInView } from "../hooks/useCountUp.js";
import "./Charts.css";

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

/**
 * A ring split by share. `parts`: [{ id, value, tone }], `tone` naming a colour class (good, good-soft, neutral, caution, bad, brand).
 * The centre holds `children` (a figure and its label).
 */
export function Donut({ parts, size = 180, children }) {
  const [ref, inView] = useInView();
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 1.2 : 0; // a hairline between the segments
  let offset = 0;
  return (
    <div ref={ref} className={inView ? "donut is-visible" : "donut"} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="donut__track" cx="50" cy="50" r={radius} />
        {total > 0 && parts.filter((p) => p.value > 0).map((part, i) => {
          const length = (part.value / total) * circumference;
          const segment = (
            <circle
              key={part.id}
              className={`donut__part tone-${part.tone}`}
              cx="50" cy="50" r={radius}
              strokeDashoffset={-offset}
              style={{ strokeDasharray: `${inView ? Math.max(0, length - gap) : 0} ${circumference}`, transitionDelay: `${i * 120}ms` }}
            />
          );
          offset += length;
          return segment;
        })}
      </svg>
      <div className="donut__centre">{children}</div>
    </div>
  );
}

/** Two rings, one inside the other: `outer` and `inner` are percentages (0-100). The centre holds `children`. */
export function RingGauge({ outer, inner, size = 180, children }) {
  const [ref, inView] = useInView();
  const ring = (r, value, cls) => {
    const c = 2 * Math.PI * r;
    return <circle className={cls} cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={inView ? c * (1 - clamp(value) / 100) : c} />;
  };
  return (
    <div ref={ref} className="ring-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="ring-gauge__track" cx="50" cy="50" r="44" />
        <circle className="ring-gauge__track" cx="50" cy="50" r="34" />
        {ring(44, outer, "ring-gauge__fill ring-gauge__fill--outer")}
        {ring(34, inner, "ring-gauge__fill ring-gauge__fill--inner")}
      </svg>
      <div className="donut__centre">{children}</div>
    </div>
  );
}

/** Vertical columns: `columns`: [{ label, value (0-100), text }]. Each column grows to its value; its figure sits on top. */
export function Columns({ columns, tone = "good", height = 180 }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref} className={inView ? "columns is-visible" : "columns"} aria-hidden="true">
      <div className="columns__plot" style={{ height }}>
        {[25, 50, 75, 100].map((line) => <span key={line} className="columns__grid" style={{ bottom: `${line}%` }}><em>{line}%</em></span>)}
        {columns.map((column, i) => (
          <div key={column.label} className="columns__col">
            <span className="columns__value">{column.text}</span>
            <span className={`columns__bar tone-${tone}`} style={{ height: `${clamp(column.value)}%`, transitionDelay: `${i * 90}ms` }} />
          </div>
        ))}
      </div>
      <div className="columns__labels">
        {columns.map((column) => <span key={column.label}>{column.label}</span>)}
      </div>
    </div>
  );
}

/**
 * Horizontal bars in groups: `groups`: [{ label, highlight, bars: [{ label, value (0-100), text, tone }] }]. One group per row, its
 * bars stacked under its name, each with its figure at the end.
 */
export function BarGroups({ groups }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref} className={inView ? "bar-groups is-visible" : "bar-groups"} aria-hidden="true">
      {groups.map((group, g) => (
        <div key={group.label} className={group.highlight ? "bar-group is-highlight" : "bar-group"}>
          <p className="bar-group__label">{group.label}</p>
          {group.bars.map((bar, b) => (
            <div key={bar.label} className="bar-row">
              <span className="bar-row__name">{bar.label}</span>
              <span className="bar-row__track">
                <span className={`bar-row__fill tone-${bar.tone ?? "brand"}`} style={{ width: `${clamp(bar.value)}%`, transitionDelay: `${(g * 3 + b) * 60}ms` }} />
              </span>
              <span className="bar-row__text">{bar.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * One row per item, each a bar split into two shares from the two ends: `rows`: [{ label, note, left, right, leftText, rightText,
 * faded }] (left and right are percentages). For "fell" against "rose".
 */
export function SplitRows({ rows, leftLabel, rightLabel }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref} className={inView ? "split-rows is-visible" : "split-rows"} aria-hidden="true">
      <div className="split-rows__key"><span className="key tone-good" />{leftLabel}<span className="key tone-caution" />{rightLabel}</div>
      {rows.map((row, i) => (
        <div key={row.label} className={row.faded ? "split-row is-faded" : "split-row"}>
          <p className="split-row__label">{row.label}{row.note && <em> {row.note}</em>}</p>
          <div className="split-row__bar">
            <span className="split-row__left tone-good" style={{ width: `${clamp(row.left)}%`, transitionDelay: `${i * 80}ms` }} />
            <span className="split-row__right tone-caution" style={{ width: `${clamp(row.right)}%`, transitionDelay: `${i * 80}ms` }} />
          </div>
          <p className="split-row__figures"><span>{row.leftText}</span><span>{row.rightText}</span></p>
        </div>
      ))}
    </div>
  );
}
