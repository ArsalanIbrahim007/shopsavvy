// ProductImage.jsx — a product photo in a fixed-shape tile, with a neutral placeholder when
// the address is missing, unsafe, or fails to load (store image links break often).
// The tile keeps its size either way, so the page does not shift.

import { useState } from "react";
import { safeExternalUrl } from "../lib/safeLink.js";

export default function ProductImage({ src, alt = "", height = 140 }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const safe = safeExternalUrl(src);
  const usable = safe && safe !== failedSrc;

  return (
    <div
      style={{
        height, display: "grid", placeItems: "center", overflow: "hidden",
        background: "var(--canvas)", borderRadius: "var(--radius-control)",
      }}
    >
      {usable ? (
        <img
          src={safe}
          alt={alt}
          loading="lazy"
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
