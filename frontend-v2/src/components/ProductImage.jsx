// ProductImage.jsx — a product photo in a fixed-shape tile, with a neutral placeholder when
// the address is missing, unsafe, or fails to load (store image links break often).
// The tile keeps its size either way, so the page does not shift.

import { useState } from "react";
import { safeExternalUrl } from "../lib/safeLink.js";

// `priority`: the main picture of a page (the one that decides how fast the page looks ready) loads straight away
// and first; every other picture waits until it is near the screen.
export default function ProductImage({ src, alt = "", height = 140, priority = false }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const safe = safeExternalUrl(src);
  const usable = safe && safe !== failedSrc;

  return (
    <div
      style={{
        height, display: "grid", placeItems: "center", overflow: "hidden",
        background: "var(--photo-tile)", borderRadius: "var(--radius-control)",
      }}
    >
      {usable ? (
        <img
          src={safe}
          alt={alt}
          width={height}
          height={height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          referrerPolicy="no-referrer"
          style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          onError={() => setFailedSrc(safe)}
        />
      ) : (
        <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="var(--ink-mute)" strokeWidth="1.6" />
          <circle cx="12" cy="18" r="1" fill="var(--ink-mute)" />
        </svg>
      )}
    </div>
  );
}
