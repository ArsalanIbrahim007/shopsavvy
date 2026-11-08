// CategoryIcon.jsx — a line drawing for each category tile on the home page, all in one style: 1.5 px strokes in the text colour on a
// 32 px grid, with one detail in amber (the screen's glow, the cooling vent, the drum...). Drawn here rather than fetched, so the tiles
// look the same in both themes and cost nothing to load. Decorative: the tile's name is the text.

const ICONS = {
  smartphone: (
    <>
      <rect x="9" y="3.5" width="14" height="25" rx="3" />
      <path className="ci-accent" d="M14 7h4" />
      <circle cx="16" cy="24.5" r="1" className="ci-fill" />
    </>
  ),
  tv: (
    <>
      <rect x="3.5" y="6" width="25" height="16" rx="2" />
      <path className="ci-accent" d="M8 18l5-5 3 3 6-6" />
      <path d="M11 27h10M16 22v5" />
    </>
  ),
  air_conditioner: (
    <>
      <rect x="3.5" y="7" width="25" height="11" rx="2.5" />
      <path d="M7 14.5h18" />
      <path className="ci-accent" d="M10 22c0 2 1.5 2 1.5 4M16 22c0 2 1.5 2 1.5 4M22 22c0 2 1.5 2 1.5 4" />
    </>
  ),
  refrigerator: (
    <>
      <rect x="8" y="3.5" width="16" height="25" rx="2.5" />
      <path d="M8 13h16" />
      <path className="ci-accent" d="M11.5 7.5v2.5M11.5 16.5v4" />
    </>
  ),
  washing_machine: (
    <>
      <rect x="5.5" y="3.5" width="21" height="25" rx="2.5" />
      <path d="M5.5 9h21" />
      <circle cx="16" cy="18.5" r="6" />
      <path className="ci-accent" d="M12.5 19.5c1.5 1.5 5.5 1.5 7 0" />
      <circle cx="9.5" cy="6.25" r="0.9" className="ci-fill" />
    </>
  ),
  headphones: (
    <>
      <path d="M6 19v-3a10 10 0 0 1 20 0v3" />
      <rect x="4.5" y="18" width="5.5" height="9" rx="2" />
      <rect x="22" y="18" width="5.5" height="9" rx="2" />
      <path className="ci-accent" d="M14 22.5h1M17 22.5h1" />
    </>
  ),
  smartwatch: (
    <>
      <rect x="9" y="9" width="14" height="14" rx="3.5" />
      <path d="M12 9l1-5.5h6L20 9M12 23l1 5.5h6l1-5.5" />
      <path className="ci-accent" d="M16 13v3.5l2.5 1.5" />
    </>
  ),
  laptop: (
    <>
      <rect x="6" y="7" width="20" height="13.5" rx="1.5" />
      <path d="M3 24.5h26l-2 2.5H5z" />
      <path className="ci-accent" d="M10.5 16.5l3-3 2.5 2.5 4.5-4.5" />
    </>
  ),
  tablet: (
    <>
      <rect x="6" y="3.5" width="20" height="25" rx="3" />
      <path className="ci-accent" d="M10 9h12M10 13h8" />
      <circle cx="16" cy="24.5" r="1" className="ci-fill" />
    </>
  ),
  monitor: (
    <>
      <rect x="3.5" y="5" width="25" height="16.5" rx="2" />
      <path d="M16 21.5v4.5M10.5 27h11" />
      <path className="ci-accent" d="M8 9.5h7" />
    </>
  ),
};

export default function CategoryIcon({ category, size = 28 }) {
  const icon = ICONS[category];
  if (!icon) return null;
  return (
    <svg className="category-icon" width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icon}
    </svg>
  );
}
