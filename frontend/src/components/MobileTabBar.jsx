// MobileTabBar.jsx — on a phone, the site's main places sit in a bar at the bottom of the screen, where a thumb reaches them, as in
// a shopping app; the header keeps the logo, the search box and the theme (Layout.css hides its links below 720px). On a tablet,
// laptop or desktop the bar is not shown and the header's links are.
//
// A friend found the phone layout hard to use (2026-11-19): the header's links wrapped onto two rows above every page.

import { Link, useLocation } from "react-router-dom";

import { useCompare } from "../lib/compare.js";

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  categories: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  deals: <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 8.5h.01" />,
  drops: <path d="M3 6l7 7 4-4 7 7M21 10v6h-6" />,
  compare: <path d="M4 5h6v14H4zM14 5h6v14h-6z" />,
};

const TABS = [
  { id: "home", label: "Home", to: "/", isCurrent: (pathname, hash) => pathname === "/" && !hash },
  { id: "categories", label: "Categories", to: "/#categories", isCurrent: (pathname, hash) => (pathname === "/" && hash === "#categories") || pathname === "/results" },
  { id: "deals", label: "Deals", to: "/#deals", isCurrent: (pathname, hash) => pathname === "/" && hash === "#deals" },
  { id: "drops", label: "Drops", to: "/drops", isCurrent: (pathname) => pathname === "/drops" },
  { id: "compare", label: "Compare", to: "/compare", isCurrent: (pathname) => pathname === "/compare" },
];

export default function MobileTabBar() {
  const { pathname, hash } = useLocation();
  const picked = useCompare().length;
  return (
    <nav className="tab-bar" aria-label="Shortcuts">
      {TABS.map((tab) => {
        const current = tab.isCurrent(pathname, hash);
        return (
          <Link key={tab.id} to={tab.to} className="tab-bar__tab" aria-current={current ? "page" : undefined}>
            <span className="tab-bar__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {ICONS[tab.id]}
              </svg>
              {tab.id === "compare" && picked > 0 && <span className="tab-bar__count">{picked}</span>}
            </span>
            <span className="tab-bar__label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
