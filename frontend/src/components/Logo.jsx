// Logo.jsx — the ShopSavvy mark (an amber price tag on an ink tile) and wordmark.
// The tag is the brand: the site exists to say whether a price tag tells the truth. The wordmark is real text
// (not an image) so it uses the bundled font and scales with the page; the link around it carries an
// accessible name of its own.

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect className="logo__tile" x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#111827" />
      <path
        className="logo__tag"
        d="M8 9.6C8 8.7 8.7 8 9.6 8h6.3c.5 0 .9.2 1.2.5l7.6 7.6c.6.6.6 1.7 0 2.3l-6.1 6.1c-.6.6-1.7.6-2.3 0l-7.6-7.6c-.3-.3-.5-.7-.5-1.2z"
        fill="#feae2c"
      />
      <circle className="logo__hole" cx="12.4" cy="12.4" r="1.7" fill="#111827" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo__word">
        Shop<span className="logo__accent">Savvy</span>
      </span>
    </span>
  );
}
