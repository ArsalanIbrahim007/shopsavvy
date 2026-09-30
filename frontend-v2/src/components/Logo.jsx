// Logo.jsx — the ShopSavvy mark (navy tile, amber "S" with a price-tag arrow) and wordmark.
// Drawn from the logo in the Stitch design files. The wordmark is real text (not an image) so it
// uses the bundled font and scales with the page; the amber "Savvy" is part of the logo and is
// exempt from text-contrast rules, so the link carries an accessible name of its own.

export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 4 42 42" aria-hidden="true" focusable="false">
      <rect className="logo__tile" x="2" y="6" width="38" height="38" rx="10" fill="#1a3c6e" />
      <path
        d="M14 26C14 23.7909 15.7909 22 18 22H24C26.2091 22 28 23.7909 28 26C28 28.2091 26.2091 30 24 30H18C15.7909 30 14 31.7909 14 34C14 36.2091 15.7909 38 18 38H25"
        stroke="#f5a623" strokeWidth="3.5" strokeLinecap="round" fill="none"
      />
      <path d="M21 16V22M21 38V42" stroke="#f5a623" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M27 12L34 19L27 26" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function Logo({ inverse = false }) {
  return (
    <span className={inverse ? "logo logo--inverse" : "logo"}>
      <LogoMark />
      <span className="logo__word">
        Shop<span className="logo__accent">Savvy</span>
      </span>
    </span>
  );
}
