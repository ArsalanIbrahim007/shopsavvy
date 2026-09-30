// ScoreCell.jsx — an offer's deal score (out of 100) with a small bar made of its four parts, and, on hover or
// keyboard focus, how the number was reached. The ranking is only defensible if the shopper can see how
// it was worked out. The cell is focusable so touch and keyboard users get the same explanation.

import { useId } from "react";

import { scoreOf, scoreParts, scoreTone } from "../../lib/score.js";
import "./results.css";

export default function ScoreCell({ offer }) {
  const popoverId = useId();
  const score = scoreOf(offer);
  const parts = scoreParts(offer);

  if (score === null) return <span className="small muted">Not scored</span>;

  return (
    <div className="score-cell" tabIndex={parts.length ? 0 : undefined} aria-describedby={parts.length ? popoverId : undefined}>
      <span className={`score-value score-${scoreTone(score)}`}>{score.toFixed(1)}</span>
      {parts.length > 0 && (
        <>
          <span className="score-bar" aria-hidden="true">
            {parts.map((part) => (
              <span key={part.key} className={`score-seg seg-${part.key}`} style={{ flexGrow: part.got || 0.01 }} />
            ))}
          </span>
          <span className="score-popover" role="tooltip" id={popoverId}>
            <span className="score-popover__head">How this score was worked out</span>
            {parts.map((part) => (
              <span className="score-popover__row" key={part.key}>
                <span className={`score-key seg-${part.key}`} aria-hidden="true" />
                <span>{part.label}</span>
                <span className="price">{part.got.toFixed(1)} / {part.max}</span>
              </span>
            ))}
            <span className="score-popover__total">
              <span>Total</span>
              <span className="price">{score.toFixed(1)} / 100</span>
            </span>
          </span>
        </>
      )}
    </div>
  );
}
