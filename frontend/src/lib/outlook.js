// outlook.js — "wait or buy?" in words. The server (priceOutlook.service.js) works out what a product's own recorded prices say and
// returns the numbers; this file turns them into the headline and the evidence a shopper reads. Every figure in a sentence is one
// the server sent, and nothing here is a prediction: it says where today's price sits among the prices we have recorded.
//
// Not enough records gives "Too early to say" and no advice, which is the honest answer for most products for now.

import { formatDate, formatNumber, formatPrice } from "./format.js";

const plural = (count, one, many = `${one}s`) => `${formatNumber(count)} ${count === 1 ? one : many}`;

const HEADLINES = {
  at_low: { tone: "good", label: "Good time to buy", headline: "Today's best price is the lowest we have recorded." },
  above_usual: { tone: "caution", label: "You may want to wait", headline: "Today's best price is above where it usually sits." },
  usual: { tone: "neutral", label: "No clear reason to wait", headline: "Today's best price is about where it usually sits." },
  flat: { tone: "neutral", label: "Waiting is unlikely to help", headline: "The best price has not moved." },
  too_early: { tone: "neutral", label: "Too early to say", headline: "We have not tracked this product for long enough to say whether its price will fall." },
};

const signed = (value) => `${value > 0 ? "up" : "down"} ${Math.abs(value)}%`;

function tooEarlyDetail(outlook) {
  const { basis, why } = outlook;
  if (why === "no_records") return "We have no price records for it yet.";
  if (why === "stale") return `Our newest record is from ${formatDate(basis.lastDay)}, too long ago to say anything about today's price.`;
  return `We have ${plural(basis.records, "record")} over ${plural(basis.days, "day")}. We need at least 7 days and 5 records before we say anything.`;
}

/** Facts that back the verdict, each one a sentence built from the server's numbers. */
function factsFor(outlook) {
  const { verdict, basis, stats } = outlook;
  if (verdict === "too_early" || !stats) return [];

  const span = `${plural(basis.days, "day")}, ${plural(basis.records, "record")}`;
  const facts = [];

  if (verdict === "at_low") {
    facts.push(`Today's best price, ${formatPrice(stats.current)}, is the lowest in our records (${span}). It has been as high as ${formatPrice(stats.high)}.`);
  } else if (verdict === "above_usual") {
    facts.push(`Today's best price, ${formatPrice(stats.current)}, is ${stats.vsUsualPct}% above its usual level of ${formatPrice(stats.usual)}.`);
    facts.push(`It was lower on ${plural(stats.daysBelow, "recorded day")} out of ${formatNumber(basis.records)} (${span}), down to ${formatPrice(stats.low)}.`);
  } else if (verdict === "usual") {
    facts.push(`Today's best price, ${formatPrice(stats.current)}, is close to its usual level of ${formatPrice(stats.usual)}.`);
    facts.push(`Over ${plural(basis.days, "day")} it ranged from ${formatPrice(stats.low)} to ${formatPrice(stats.high)} (${plural(basis.records, "record")}).`);
  } else if (verdict === "flat") {
    facts.push(`In ${span} it stayed between ${formatPrice(stats.low)} and ${formatPrice(stats.high)}, so there is no sign of a drop to wait for.`);
  }

  if (stats.changeWeekPct !== null && stats.changeWeekPct !== 0 && verdict !== "flat") facts.push(`Over the last week the best price went ${signed(stats.changeWeekPct)}.`);
  if (stats.daysSinceChange !== null && verdict !== "flat") {
    facts.push(stats.daysSinceChange === 0 ? "The price changed today." : `The price last changed ${plural(stats.daysSinceChange, "day")} ago.`);
  }
  return facts;
}

/** How prices at the stores we track have moved over about a week, with the size of the sample, or null when there is none. */
export function marketNote(market) {
  if (!market || !(market.comparisons > 0)) return null;
  const { comparisons, fell, rose, steady, comparedFrom, comparedTo, fellFromLargestStore, stores } = market;
  const period = comparedFrom && comparedTo ? ` from ${formatDate(comparedFrom)} to ${formatDate(comparedTo)}` : "";
  let text = `For context: in ${plural(comparisons, "week-long comparison")} across ${plural(stores, "store")}${period}, ${formatNumber(fell)} prices fell by 3% or more, ${formatNumber(rose)} rose by 3% or more and ${formatNumber(steady)} stayed within 3%.`;
  if (fell > 0 && fellFromLargestStore !== null) text += ` ${fellFromLargestStore}% of the falls came from one store, so treat this as a rough guide only.`;
  return text;
}

/**
 * Everything the outlook panel shows.
 * @param {object|null} outlook  the server's `outlook`, or null
 * @returns {{verdict: string, tone: string, label: string, headline: string, detail: string|null, facts: string[], early: boolean,
 *            market: string|null}|null}  null when there is no outlook to show
 */
export function describeOutlook(outlook) {
  if (!outlook?.verdict || !HEADLINES[outlook.verdict]) return null;
  const { tone, label, headline } = HEADLINES[outlook.verdict];
  const tooEarly = outlook.verdict === "too_early";
  return {
    verdict: outlook.verdict,
    tone,
    label,
    headline,
    detail: tooEarly ? tooEarlyDetail(outlook) : null,
    facts: factsFor(outlook),
    // a verdict on under four weeks of records is an early estimate; "too early" is not an estimate at all
    early: !tooEarly && outlook.strength !== "fair",
    market: marketNote(outlook.market),
  };
}
