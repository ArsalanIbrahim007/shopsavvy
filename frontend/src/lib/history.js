// history.js — price history as data for a chart. No drawing here: this turns the recorded prices of
// every store's offer into series, stats and geometry that a component only has to render.
//
// History is recorded about once a day (or when a price changes), so a product first seen today has a
// single point. That is reported as what it is; nothing is interpolated or invented. Prices HOLD until
// they change, so lines are steps, not slopes (a slope would imply a gradual fall that never happened).

import { formatAxisDate } from "./format.js";
import { platformName } from "./platforms.js";

const DAY_MS = 24 * 3600 * 1000;

export const RANGES = [
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];
export const DEFAULT_RANGE = "90d";

/** The offer's recorded prices as [{price, at}], valid and in time order, one per instant. */
export function historyPoints(offer) {
  const seen = new Set();
  return (offer?.priceHistory ?? [])
    .map((point) => ({ price: Number(point.price), at: new Date(point.recordedAt) }))
    .filter((point) => point.price > 0 && Number.isFinite(point.at.getTime()))
    .sort((a, b) => a.at - b.at)
    .filter((point) => {
      const key = point.at.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Lowest, highest, first, latest and the change between the first and the latest. */
export function historyStats(points) {
  if (!points.length) return null;
  const prices = points.map((point) => point.price);
  const first = points[0];
  const last = points[points.length - 1];
  return {
    count: points.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    first,
    last,
    changePercent: Math.round(((last.price - first.price) / first.price) * 100),
  };
}

/**
 * The points inside a range. The last price recorded BEFORE the window is kept and moved to the window's
 * start, because that price was still the price when the window began.
 */
export function pointsInRange(points, rangeId, now = Date.now()) {
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES.find((r) => r.id === DEFAULT_RANGE);
  if (range.days === null || points.length === 0) return points;

  const start = now - range.days * DAY_MS;
  const inside = points.filter((point) => point.at.getTime() >= start);
  const before = points.filter((point) => point.at.getTime() < start).at(-1);
  return before ? [{ price: before.price, at: new Date(start) }, ...inside] : inside;
}

/**
 * One series per offer that has history in the range, for the chart and its legend.
 * @returns {Array<{id: string, platform: string, name: string, points: Array, isCurrent: boolean}>}
 */
export function buildSeries(offers, rangeId, { currentId, now = Date.now() } = {}) {
  return (offers ?? [])
    .map((offer) => ({
      id: String(offer._id),
      platform: offer.platform,
      name: platformName(offer.platform),
      points: pointsInRange(historyPoints(offer), rangeId, now),
      isCurrent: offer._id === currentId,
    }))
    .filter((series) => series.points.length > 0);
}

/** The path of a step line: flat until the next recorded change, then straight up or down. */
export function stepPath(coords) {
  return coords.map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `H${x.toFixed(1)}V${y.toFixed(1)}`)).join(" ");
}

/**
 * Round axis values: about `target` ticks, each a multiple of 1, 2 or 5 times a power of ten, that cover
 * [min, max]. A flat range (min = max) gets a band of 5% either side, so a single price still has an axis.
 * @returns {{ticks: number[], min: number, max: number}} min and max are the first and last tick
 */
export function niceTicks(min, max, target = 5) {
  if (!(max > min)) {
    const band = Math.max(Math.abs(min) * 0.05, 1);
    return niceTicks(min - band, max + band, target);
  }
  const rough = (max - min) / Math.max(target - 1, 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const first = Math.max(Math.floor(min / step) * step, 0); // prices are never negative
  const last = Math.ceil(max / step) * step;
  const ticks = [];
  for (let i = 0; first + i * step <= last + step / 1000; i++) ticks.push(Math.round((first + i * step) / step) * step);
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1] };
}

const DATE_STEPS_DAYS = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365];

/**
 * Dates for the bottom axis: local midnights, a whole number of days apart (the smallest step that keeps
 * the count at or under `target`), starting at the first midnight inside the range. A range shorter than
 * two days gets its two ends.
 */
export function dateTicks(from, to, target = 6) {
  const span = to.getTime() - from.getTime();
  if (span < 2 * DAY_MS) return [from, to];

  const stepDays = DATE_STEPS_DAYS.find((days) => span / (days * DAY_MS) <= target) ?? DATE_STEPS_DAYS.at(-1);
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (first < from) first.setDate(first.getDate() + 1);

  const ticks = [];
  for (let at = new Date(first); at <= to; at = new Date(at.getFullYear(), at.getMonth(), at.getDate() + stepDays)) ticks.push(at);
  return ticks;
}

/** The price a series held at `time` (ms): its last recorded price at or before then, or null before its first. */
export function priceAtTime(points, time) {
  let price = null;
  for (const point of points) {
    if (point.at.getTime() <= time) price = point.price;
    else break;
  }
  return price;
}

/**
 * What every store charged at `time`, cheapest first, for the hover readout. A store with no recorded
 * price yet at that time is left out rather than shown as zero.
 */
export function hoverRows(series, time) {
  const rows = series
    .map((s) => ({ id: s.id, name: s.name, platform: s.platform, isCurrent: s.isCurrent, price: priceAtTime(s.points, time) }))
    .filter((row) => row.price !== null)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  // A store that lists one product in several colours has several identical lines: one row for them, not four.
  // (Where the listing the shopper opened is one of them, its row is the one kept.)
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.platform}|${row.price}`;
    if (!seen.has(key) || (row.isCurrent && !seen.get(key).isCurrent)) seen.set(key, row);
  }
  return rows.filter((row) => seen.get(`${row.platform}|${row.price}`) === row);
}

/**
 * Scales for drawing every series on one set of axes, with labelled ticks on both.
 * Returns null when there is nothing to draw; a chart needs at least two recorded days somewhere.
 */
export function chartModel(series, { width = 720, height = 340, pad = { top: 14, right: 18, bottom: 56, left: 78 }, xTarget = 6, yTarget = 5 } = {}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const times = all.map((point) => point.at.getTime());
  const prices = all.map((point) => point.price);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (t1 === t0) return null; // a single moment: nothing to show a line over

  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  // a little room above and below, so the highest and lowest prices do not sit on the frame
  const room = (hi - lo) * 0.05;
  const axis = niceTicks(lo - room, hi + room, yTarget);
  const x = (at) => pad.left + ((at.getTime() - t0) / (t1 - t0)) * innerW;
  const y = (price) => pad.top + innerH - ((price - axis.min) / (axis.max - axis.min)) * innerH;
  const from = new Date(t0);
  const to = new Date(t1);
  const withYear = from.getFullYear() !== to.getFullYear();

  return {
    width,
    height,
    pad,
    min: lo,
    max: hi,
    from,
    to,
    x,
    y,
    /** the time under a horizontal position in the chart, kept inside the drawn range */
    timeAt: (px) => new Date(t0 + (Math.min(Math.max(px, pad.left), pad.left + innerW) - pad.left) / innerW * (t1 - t0)),
    yTicks: axis.ticks.map((value) => ({ value, y: y(value), label: value.toLocaleString("en-US") })),
    xTicks: dateTicks(from, to, xTarget).map((at) => ({ at, x: x(at), label: formatAxisDate(at, { withYear }) })),
    lines: series.map((s) => {
      const coords = s.points.map((point) => [x(point.at), y(point.price)]);
      // Extend the last price to the right edge: it is still the price today.
      const last = s.points.at(-1);
      const extended = last.at.getTime() < t1 ? [...coords, [x(new Date(t1)), y(last.price)]] : coords;
      return { id: s.id, name: s.name, isCurrent: s.isCurrent, path: stepPath(extended), dots: s.points.map((point, i) => ({ price: point.price, at: point.at, cx: coords[i][0], cy: coords[i][1] })) };
    }),
  };
}

/** A sparkline's points for one offer: null unless it has at least two recorded prices. */
export function sparklineModel(offer, { width = 92, height = 28 } = {}) {
  const points = historyPoints(offer);
  if (points.length < 2) return null;

  const prices = points.map((point) => point.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const range = hi - lo || 1;
  const first = prices[0];
  const last = prices.at(-1);
  return {
    width,
    height,
    polyline: prices.map((price, i) => `${((i / (prices.length - 1)) * width).toFixed(1)},${(height - ((price - lo) / range) * height).toFixed(1)}`).join(" "),
    endY: height - ((last - lo) / range) * height,
    tone: last < first ? "down" : last > first ? "up" : "flat",
    changePercent: Math.round(((last - first) / first) * 100),
    min: lo,
    max: hi,
    count: prices.length,
  };
}
