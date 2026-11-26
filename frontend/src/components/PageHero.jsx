// PageHero.jsx — the top of every side page (How it works, How accurate we are, How to use it, Help us test it, Privacy, Price drops,
// Compare), 2026-11-21: an icon tile, a small label, the page's title and its lead, on a soft brand-tinted card, so the side pages
// look like one site with the home page rather than plain text under the header.

import "./PageHero.css";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  how: <g {...ICON}><path d="M4 12.5 9 17.5 20 6.5" /><path d="M4 6.5h6M4 9.5h4" /></g>,
  accuracy: <g {...ICON}><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5.1 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></g>,
  help: <g {...ICON}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.8M12 17h.01" /></g>,
  test: <g {...ICON}><path d="M9 4h6v3H9z" /><path d="M15 5.5h2.5v15h-11v-15H9" /><path d="m9 13 2 2 4-4" /></g>,
  privacy: <g {...ICON}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></g>,
  drops: <g {...ICON}><path d="M3 6.5 10 13.5l4-4 7 7" /><path d="M21 11v5.5h-5.5" /></g>,
  compare: <g {...ICON}><rect x="3.5" y="4.5" width="7" height="15" rx="1.5" /><rect x="13.5" y="4.5" width="7" height="15" rx="1.5" /></g>,
  extension: <g {...ICON}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></g>,
};

/**
 * @param {object} props
 * @param {keyof ICONS} props.icon
 * @param {string} props.eyebrow  a few words above the title
 * @param {string} props.title    the page's h1
 * @param {import("react").ReactNode} [props.lead]
 * @param {import("react").ReactNode} [props.children]  anything under the lead (filters, a button)
 */
export default function PageHero({ icon, eyebrow, title, lead, children }) {
  return (
    <header className="page-hero">
      <span className="page-hero__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" focusable="false">{ICONS[icon]}</svg>
      </span>
      <div className="page-hero__text">
        {eyebrow && <p className="page-hero__eyebrow">{eyebrow}</p>}
        <h1 className="page-hero__title">{title}</h1>
        {lead && <p className="page-hero__lead">{lead}</p>}
        {children}
      </div>
    </header>
  );
}
