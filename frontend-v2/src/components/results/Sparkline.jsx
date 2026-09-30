// Sparkline.jsx — the direction one offer's price has taken, in a few pixels. Needs two recorded prices;
// with fewer it says tracking has only just started instead of drawing anything.

import { sparklineModel } from "../../lib/history.js";
import { formatNumber } from "../../lib/format.js";
import "./results.css";

const ARROWS = { down: "↓", up: "↑", flat: "→" };

export default function Sparkline({ offer }) {
  const model = sparklineModel(offer);
  if (!model) return <span className="small muted">Tracking started</span>;

  return (
    <span className={`sparkline sparkline--${model.tone}`} title={`${model.count} recorded prices, low ${formatNumber(model.min)}, high ${formatNumber(model.max)}`}>
      <svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true" focusable="false">
        <polyline points={model.polyline} fill="none" strokeWidth="1.8" />
        <circle cx={model.width} cy={model.endY} r="2.6" />
      </svg>
      <span className="small">
        {ARROWS[model.tone]} {Math.abs(model.changePercent)}% since first seen
      </span>
    </span>
  );
}
