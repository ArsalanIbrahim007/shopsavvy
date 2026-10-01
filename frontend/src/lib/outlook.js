// outlook.js — "wait or buy?" as something a shopper can see at a glance. The server (priceOutlook.service.js) works out what a
// product's own recorded prices say and sends the numbers; this file turns them into the pieces the panel draws: a verdict, a
// gauge of where today's price sits between the lowest and highest it has been, a chart of the best price day by day, four
// figures, how much evidence there is, and how prices have moved across the stores we track. Every figure is one the server sent;
// nothing here is a prediction.
//
// Not enough records gives "Too early to say", how far the product is from having enough, and no gauge, chart or advice: the honest
// answer for most products for now.

import { formatAxisDate, formatDate, formatNumber, formatPrice } from "./format.js";
import { chartModel } from "./history.js";

// The server sends its thresholds with every outlook (`limits`); these are only used if an older server does not.
const DEFAULT_LIMITS = { minDays: 7, minRecords: 5, fairDays: 28, fairRecords: 20, staleDays: 3 };

const plural = (count, one, many = `${one}s`) => `${formatNumber(count)} ${count === 1 ? one : many}`;

const VERDICTS = {
  at_low: { tone: "good", glyph: "↓", label: "Good time to buy", headline: "Today's best price is at or near the lowest we have recorded." },
  above_usual: { tone: "caution", glyph: "↑", label: "You may want to wait", headline: "Today's best price is above where it usually sits." },
  usual: { tone: "neutral", glyph: "≈", label: "No clear reason to wait", headline: "Today's best price is about where it usually sits." },
  flat: { tone: "neutral", glyph: "=", label: "Waiting is unlikely to help", headline: "The best price has not moved." },
  too_early: { tone: "neutral", glyph: "…", label: "Too early to say", headline: "We have not tracked this product for long enough to say whether its price will fall." },
};

function tooEarlyDetail(outlook, limits) {
  const { basis, why } = outlook;
  if (why === "no_records") return "We have no price records for it yet.";
  if (why === "stale") return `Our newest record is from ${formatDate(basis.lastDay)}, too long ago to say anything about today's price.`;
  return `We have ${plural(basis.records, "record")} over ${plural(basis.days, "day")}. We need at least ${limits.minDays} days and ${limits.minRecords} records before we say anything.`;
}

const roundTo = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/** "3.2% below", "5% above", "At its usual price". */
function versusUsual(stats) {
  const change = stats.vsUsualPct;
  const value = change === 0 ? "At its usual price" : `${Math.abs(change)}% ${change < 0 ? "below" : "above"}`;
  return {
    id: "usual", label: "Versus its usual price", value, hint: `Usual price ${formatPrice(stats.usual)}`,
    trend: change < 0 ? "down" : change > 0 ? "up" : "flat",
    tone: change <= -1 ? "good" : change >= 5 ? "caution" : "neutral",
  };
}

function lastWeek(stats) {
  const change = stats.changeWeekPct;
  if (change === null) return { id: "week", label: "Last 7 days", value: "Not enough history", hint: "Needs a record from a week ago", trend: null, tone: "neutral" };
  return {
    id: "week", label: "Last 7 days", value: change === 0 ? "No change" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}%`,
    hint: "Best price, a week ago to today", trend: change < 0 ? "down" : change > 0 ? "up" : "flat", tone: change < 0 ? "good" : change > 0 ? "caution" : "neutral",
  };
}

function lastChanged(stats) {
  const days = stats.daysSinceChange;
  return {
    id: "changed", label: "Price last changed", value: days === null ? "Not in the records" : days === 0 ? "Today" : `${plural(days, "day")} ago`,
    hint: "A move of 0.5% or more", trend: null, tone: "neutral",
  };
}

function tracked(basis) {
  return { id: "tracked", label: "Tracked for", value: plural(basis.days, "day"), hint: plural(basis.records, "record"), trend: null, tone: "neutral" };
}

/**
 * Where today's price sits between the lowest and highest the best price has been, as positions (0 to 100) along a bar. Null when it
 * never moved (a bar of no length says nothing).
 */
export function gaugeFor(stats) {
  if (!stats || !(stats.high > stats.low)) return null;
  const at = (price) => roundTo(((price - stats.low) / (stats.high - stats.low)) * 100);
  const current = Math.min(100, Math.max(0, at(stats.current)));
  return {
    low: stats.low, high: stats.high, usual: stats.usual, current: stats.current,
    currentPct: current, usualPct: Math.min(100, Math.max(0, at(stats.usual))),
    caption: current <= 0 ? "At the bottom of its range" : current >= 100 ? "At the top of its range" : `${Math.round(current)}% of the way from its lowest to its highest price`,
  };
}

/** How much history there is, against what a fair estimate (or, for too early, any estimate) needs. */
export function evidenceFor(outlook, limits) {
  const { basis, verdict } = outlook;
  if (verdict === "too_early" && outlook.why === "stale") return null;
  const tooEarly = verdict === "too_early";
  const meter = (id, label, value, target) => ({ id, label, value, target, share: Math.min(1, value / target), reached: value >= target });
  const meters = [
    meter("days", "Days of records", basis.days, tooEarly ? limits.minDays : limits.fairDays),
    meter("records", "Records", basis.records, tooEarly ? limits.minRecords : limits.fairRecords),
  ];
  return {
    title: tooEarly ? "Needed before we can say anything" : "How much history this rests on",
    note: tooEarly ? null : meters.every((m) => m.reached) ? "Enough for a fair estimate." : "An early estimate until both reach the mark.",
    meters,
  };
}

/** How prices at the stores we track have moved over about a week, as shares that add up to 100, or null when there is no sample. */
export function movementFor(market) {
  if (!market || !(market.comparisons > 0)) return null;
  const { comparisons: total, fell, rose, steady, comparedFrom, comparedTo, fellFromLargestStore, stores } = market;
  const fellShare = Math.round((fell / total) * 100);
  const roseShare = Math.round((rose / total) * 100);
  return {
    total, fell, rose, steady, stores, fellShare, roseShare, steadyShare: Math.max(0, 100 - fellShare - roseShare),
    period: comparedFrom && comparedTo ? `${formatDate(comparedFrom)} to ${formatDate(comparedTo)}` : null,
    concentration: fell > 0 && fellFromLargestStore !== null ? `${fellFromLargestStore}% of the falls came from one store, so treat this as a rough guide only.` : null,
  };
}

/**
 * The chart of the best price day by day, on axes, as a step line (a price holds until it changes) with today's price marked and the
 * lowest, usual and highest levels as reference lines. Null with fewer than two days of records.
 */
export function chartFor(outlook, { width = 640, height = 240 } = {}) {
  const { series, stats } = outlook;
  if (!stats || !Array.isArray(series) || series.length < 2) return null;

  const points = series.map((point) => ({ price: point.price, at: new Date(`${point.day}T12:00:00+05:00`) }));
  const model = chartModel([{ id: "best", name: "Best price", isCurrent: true, points }], {
    width, height, pad: { top: 14, right: 12, bottom: 34, left: width < 460 ? 62 : 68 }, xTarget: width < 460 ? 3 : 5, yTarget: 4,
  });
  if (!model) return null;

  const line = model.lines[0];
  const today = line.dots.at(-1);
  const reference = (id, label, price) => ({ id, label, price, y: model.y(price) });
  return {
    ...model,
    path: line.path,
    dots: line.dots,
    today: { cx: today.cx, cy: today.cy, price: today.price },
    references: [reference("high", "Highest", stats.high), reference("usual", "Usual", stats.usual), reference("low", "Lowest", stats.low)],
    description: `The best price each day for ${plural(outlook.basis.days, "day")} (${plural(outlook.basis.records, "record")}): lowest ${formatPrice(stats.low)}, usual ${formatPrice(stats.usual)}, highest ${formatPrice(stats.high)}, and ${formatPrice(stats.current)} today.`,
    xLabelFrom: formatAxisDate(model.from),
    xLabelTo: formatAxisDate(model.to),
  };
}

/**
 * Everything the outlook panel shows.
 * @param {object|null} outlook  the server's `outlook`, or null
 * @returns {object|null}  null when there is no outlook to show
 */
export function describeOutlook(outlook) {
  if (!outlook?.verdict || !VERDICTS[outlook.verdict]) return null;
  const limits = { ...DEFAULT_LIMITS, ...(outlook.limits ?? {}) };
  const { tone, glyph, label, headline } = VERDICTS[outlook.verdict];
  const tooEarly = outlook.verdict === "too_early";
  const stats = tooEarly ? null : outlook.stats;

  return {
    verdict: outlook.verdict,
    tone,
    glyph,
    label,
    headline,
    detail: tooEarly ? tooEarlyDetail(outlook, limits) : null,
    // a verdict on under four weeks of records is an early estimate; "too early" is not an estimate at all
    early: !tooEarly && outlook.strength !== "fair",
    gauge: gaugeFor(stats),
    tiles: stats ? [versusUsual(stats), lastWeek(stats), lastChanged(stats), tracked(outlook.basis)] : [],
    evidence: evidenceFor(outlook, limits),
    movement: movementFor(outlook.market),
  };
}
