// StoreLogo.jsx — a store's logo next to its name, like the retailer lists on price-comparison sites.
// Uses the bundled logo file when there is one (see lib/storeLogos.js), otherwise a monogram badge in
// the store's brand colour. The name is always shown as text, so the image is decorative.

import { useState } from "react";

import { logoSrc } from "../lib/storeLogos.js";
import { platformColor, platformInitial, platformName } from "../lib/platforms.js";
import "./StoreLogo.css";

export function StoreMark({ platform, size = 28 }) {
  const src = logoSrc(platform);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };

  if (src && !failed) {
    return <img className="store-mark store-mark--logo" src={src} alt="" width={size} height={size} style={style} onError={() => setFailed(true)} />;
  }
  return (
    <span className="store-mark" aria-hidden="true" style={{ ...style, background: platformColor(platform) }}>
      {platformInitial(platform)}
    </span>
  );
}

/** Logo and name together. */
export default function StoreLogo({ platform, size = 28 }) {
  return (
    <span className="store-logo">
      <StoreMark platform={platform} size={size} />
      <span className="store-logo__name">{platformName(platform)}</span>
    </span>
  );
}
