// CompareTray.jsx — the bar at the foot of every page while products are picked to compare: which ones, a link to compare them
// (from two), and a way to clear the list. Hidden on the Compare page itself and when nothing is picked.

import { Link, useLocation } from "react-router-dom";

import { clearCompare, COMPARE_MAX, comparePath, removeFromCompare, useCompare } from "../lib/compare.js";
import "./Compare.css";

export default function CompareTray() {
  const items = useCompare();
  const { pathname } = useLocation();
  if (items.length === 0 || pathname === "/compare") return null;

  return (
    <aside className="compare-tray" aria-label="Products to compare">
      <div className="container compare-tray__inner">
        <ul className="compare-tray__items">
          {items.map((item) => (
            <li key={item.id} className="compare-tray__item">
              <span className="compare-tray__name">{item.name}</span>
              <button type="button" className="compare-tray__remove" aria-label={`Remove ${item.name} from compare`} onClick={() => removeFromCompare(item.id)}>×</button>
            </li>
          ))}
        </ul>
        <div className="compare-tray__actions">
          {items.length >= 2 ? (
            <Link className="btn btn-primary" to={comparePath(items)}>Compare {items.length}</Link>
          ) : (
            <span className="small muted">Pick one more to compare (up to {COMPARE_MAX})</span>
          )}
          <button type="button" className="btn btn-ghost" onClick={clearCompare}>Clear</button>
        </div>
      </div>
    </aside>
  );
}
