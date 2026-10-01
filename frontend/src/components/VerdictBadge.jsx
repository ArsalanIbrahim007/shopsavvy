// VerdictBadge.jsx — one verdict as a small pill: colour, a symbol and a word, so the meaning
// never depends on colour alone. `tone` comes from lib/verdicts.js (good, caution, bad, neutral).

const SYMBOLS = { good: "✓", caution: "!", bad: "✕", neutral: "•" };

export default function VerdictBadge({ tone = "neutral", label, title }) {
  return (
    <span className={`badge badge-${SYMBOLS[tone] ? tone : "neutral"}`} title={title || undefined}>
      <span aria-hidden="true">{SYMBOLS[tone] || SYMBOLS.neutral}</span>
      {label}
    </span>
  );
}
