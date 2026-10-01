// integrity.js — turning the backend's integrity report (GET /api/integrity) into what the "how we keep prices honest" page
// shows. Pure functions, no React. Nothing here estimates or rounds a number up: shares are rounded to whole per cent (one
// decimal below 10%), and a share of nothing is null, never 0%.

/** part as a share of whole, in per cent: whole number from 10% up, one decimal below; null when there is no whole. */
export function share(part, whole) {
  if (!(whole > 0) || !Number.isFinite(part)) return null;
  const value = (part / whole) * 100;
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** 71.4 -> "71.4%", null -> "n/a". The evaluation reports give one decimal, and so does the page. */
export const formatScore = (value) => (Number.isFinite(value) ? `${value.toFixed(1).replace(/\.0$/, "")}%` : "n/a");

/** "17%" for a share, "n/a" for none. */
export const formatShare = (value) => (value === null || value === undefined ? "n/a" : `${value}%`);

const VERDICTS = [
  { id: "genuine", label: "Verified", tone: "good", hint: "The price history supports the claimed discount" },
  { id: "likelyGenuine", label: "Likely genuine", tone: "good", hint: "Mostly supported by the price history" },
  { id: "unverified", label: "Unverified", tone: "neutral", hint: "Too little price history to judge (three recorded prices are needed)" },
  { id: "suspicious", label: "Suspicious", tone: "caution", hint: "The claimed discount is larger than the price history supports" },
  { id: "likelyFake", label: "Likely fake", tone: "bad", hint: "The price history strongly contradicts the claimed discount" },
];

/** One row per discount verdict: its count and its share of all the claims. Always the same five rows, in this order. */
export function discountRows(discounts) {
  const claims = discounts?.claims ?? 0;
  return VERDICTS.map((verdict) => {
    const count = discounts?.verdicts?.[verdict.id] ?? 0;
    return { ...verdict, count, share: share(count, claims) };
  });
}

/** The phone and tablet PTA figures, each with its share of the phone and tablet offers. */
export function ptaRows(pta) {
  const offers = pta?.offers ?? 0;
  const row = (id, label, count, hint) => ({ id, label, count: count ?? 0, share: share(count ?? 0, offers), hint });
  return [
    row("approved", "State PTA approved", pta?.approved, "The title or the store's own page says so"),
    row("nonPta", "State non-PTA", pta?.nonPta, "Kept apart from approved phones, never compared with them"),
    row("notStated", "Do not say, priced like the rest", pta?.notStated, "Shown, labelled, and never the best deal of a PTA-approved phone"),
    row("movedOut", "Do not say, priced far below", pta?.movedOut, "Taken out of the PTA-approved product: may be non-PTA"),
  ];
}

const OUTLOOK_LABELS = {
  too_early: "Too early to say",
  flat: "The price had not moved",
  at_low: "At its lowest recorded price",
  above_usual: "5% or more above its usual price",
  usual: "Around its usual price",
};

/** The wait-or-buy backtest as rows in a fixed order: what the panel would have said, and what the price then did. */
export function outlookRows(outlook) {
  return (outlook?.rows ?? []).map((row) => ({ ...row, label: OUTLOOK_LABELS[row.verdict] ?? row.label }));
}

/** True when at least one verdict that says something (not "too early") has enough comparisons to be judged. */
export const outlookJudgeable = (outlook) => (outlook?.rows ?? []).some((row) => row.verdict !== "too_early" && row.judgeable);

/** The models compared on the same held-out pairs, in the order the page shows them. Missing models are left out. */
export function matcherRows(models) {
  const labels = [
    ["production", "The model we use", true],
    ["rule", "A plain rule (titles at least 70% alike)", false],
    ["candidate", "A newer model, not in use yet", false],
  ];
  return labels
    .filter(([id]) => models?.[id])
    .map(([id, label, inUse]) => ({ id, label, inUse, ...models[id] }));
}

/** How much of an invented mark-up the detector catches, smallest mark-up first, as "1.3x" -> 9.5. */
export function markupRows(caught) {
  return Object.entries(caught ?? {})
    .map(([label, value]) => ({ label, factor: Number.parseFloat(label), caught: value }))
    .filter((row) => Number.isFinite(row.factor) && Number.isFinite(row.caught))
    .sort((a, b) => a.factor - b.factor);
}

/** "about 71 in 100": a per-cent score said the way a person says it. */
export const perHundred = (value) => (Number.isFinite(value) ? `about ${Math.round(value)} in 100` : "n/a");

/** Whole days between an ISO date and now, at least 1, or null. */
export function daysSince(iso, now = Date.now()) {
  const time = Date.parse(iso ?? "");
  return Number.isFinite(time) ? Math.max(1, Math.round((now - time) / 86400000)) : null;
}
