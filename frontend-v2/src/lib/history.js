// history.js — price history as data for a chart. No drawing here: this turns the recorded prices of
// every store's offer into series, stats and geometry that a component only has to render.
//
// History is recorded about once a day (or when a price changes), so a product first seen today has a
// single point. That is reported as what it is; nothing is interpolated or invented. Prices HOLD until
// they change, so lines are steps, not slopes (a slope would imply a gradual fall that never happened).

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
 * Scales for drawing every series on one set of axes.
 * Returns null when there is nothing to draw; a chart needs at least two recorded days somewhere.
 */
export function chartModel(series, { width = 640, height = 240, pad = { top: 16, right: 16, bottom: 30, left: 64 } } = {}) {
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
  const flat = hi === lo;
  const x = (at) => pad.left + ((at.getTime() - t0) / (t1 - t0)) * innerW;
  const y = (price) => (flat ? pad.top + innerH / 2 : pad.top + innerH - ((price - lo) / (hi - lo)) * innerH);

  return {
    width,
    height,
    pad,
    min: lo,
    max: hi,
    from: new Date(t0),
    to: new Date(t1),
    x,
    y,
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
