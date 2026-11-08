// fairPrice.js — how the lowest price sits against the fair price for its specs (components/results/FairPrice.jsx).

/** "8% below", "3% above" or "about the fair price" (within 2%). */
export function fairPriceGap(price, fair) {
  if (!(price > 0) || !(fair?.price > 0)) return null;
  const gap = (price - fair.price) / fair.price;
  if (Math.abs(gap) < 0.02) return { tone: "neutral", text: "about the fair price" };
  const pct = `${Math.round(Math.abs(gap) * 100)}%`;
  return gap < 0 ? { tone: "good", text: `${pct} below it` } : { tone: "caution", text: `${pct} above it` };
}
