// VerdictBadge.jsx — one verdict as a small pill: colour, a picture and a word, so the meaning never depends on colour alone.
// `tone` comes from lib/verdicts.js (good, caution, bad, neutral).
//
// Each common verdict has its own small drawing (2026-11-21): a clock for "Wait", a crossed-out tag for a fake or doubtful discount,
// a thumbs-up for "Good deal", scales for "Fair price", a shield for PTA status, a downward arrow for the lowest recorded price. Any
// other verdict keeps its tone's mark (✓ ! ✕ •).

const SYMBOLS = { good: "✓", caution: "!", bad: "✕", neutral: "•" };

const PATHS = {
  wait: <><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></>,
  fake: <><path d="M2.5 3.8v3.3l6.2 6.2 4.6-4.6-6.2-6.2H3.8z" /><path d="M2 14 14 2" /></>,
  good: <><path d="M5.5 7v6.5H3V7zM5.5 7 8 2.5c1.1 0 1.8.8 1.6 1.9L9.2 6.5h3.3c.8 0 1.4.8 1.2 1.6l-1.1 4.3c-.2.6-.7 1.1-1.4 1.1H5.5" /></>,
  fair: <><path d="M8 2.5v11M4.5 13.5h7M3 5h10M3 5 1.5 9h3zM13 5l-1.5 4h3z" /></>,
  shield: <><path d="M8 1.8 3 3.6v4c0 3 2.1 5.4 5 6.6 2.9-1.2 5-3.6 5-6.6v-4z" /><path d="m5.8 8 1.6 1.6L10.4 6.5" /></>,
  shieldAlert: <><path d="M8 1.8 3 3.6v4c0 3 2.1 5.4 5 6.6 2.9-1.2 5-3.6 5-6.6v-4z" /><path d="M8 5.2v3.3M8 10.6v.1" /></>,
  low: <><path d="M8 2.5v10M4 8.8l4 4 4-4" /></>,
};

/** The drawing for a verdict's word, or null for one without its own. */
function iconFor(label) {
  const text = String(label ?? "").toLowerCase();
  if (/^wait\b/.test(text)) return "wait";
  if (/fake|suspicious|never sold|inflated|doubtful/.test(text)) return "fake";
  if (/good deal|buy now|verified discount/.test(text)) return "good";
  if (/fair price/.test(text)) return "fair";
  if (/non-pta|pta not stated|likely non/.test(text)) return "shieldAlert";
  if (/pta approved/.test(text)) return "shield";
  if (/lowest we've recorded|lowest recorded/.test(text)) return "low";
  return null;
}

export default function VerdictBadge({ tone = "neutral", label, title }) {
  const kind = SYMBOLS[tone] ? tone : "neutral";
  const icon = iconFor(label);
  return (
    <span className={`badge badge-${kind}`} title={title || undefined}>
      {icon ? (
        <svg className="badge__icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {PATHS[icon]}
        </svg>
      ) : (
        <span aria-hidden="true">{SYMBOLS[kind]}</span>
      )}
      {label}
    </span>
  );
}
