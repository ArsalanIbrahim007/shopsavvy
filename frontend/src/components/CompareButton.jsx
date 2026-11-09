// CompareButton.jsx — adds a product to the Compare list, or takes it off (lib/compare.js). Says why when it cannot add one (a
// different kind of product, or the list is full), next to the button, for screen readers too.

import { useState } from "react";

import { inCompare, toggleCompare, useCompare } from "../lib/compare.js";
import "./Compare.css";

/** @param {{item: {id: string, name: string, category?: string, image?: string}, className?: string}} props */
export default function CompareButton({ item, className = "" }) {
  useCompare(); // re-render when the list changes anywhere
  const [note, setNote] = useState("");
  const picked = inCompare(item.id);

  function toggle() {
    const result = toggleCompare(item);
    setNote(result.ok ? "" : result.reason);
  }

  return (
    <span className={`compare-toggle ${className}`.trim()}>
      <button type="button" className={`btn ${picked ? "btn-primary" : "btn-ghost"} compare-toggle__button`} aria-pressed={picked} onClick={toggle}>
        {picked ? "✓ In compare" : "Compare"}
      </button>
      {/* Only when there is something to say: a card on every result must not add an empty live region each. */}
      {note && <span className="small compare-toggle__note" role="alert">{note}</span>}
    </span>
  );
}
