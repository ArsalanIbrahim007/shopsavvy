// Layout.jsx — the frame around every page: skip link, header (logo, search, category links), the
// page itself, and the footer. A page that crashes is caught here, so the header and footer
// (and the way back to the home page) stay on screen.

import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { getHealth } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { timeAgo } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import CategoryMenu from "./CategoryMenu.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBox from "./SearchBox.jsx";
import { StoreMark } from "./StoreLogo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import CompareTray from "./CompareTray.jsx";
import "./Layout.css";

const STORES = [
  "priceoye", "shophive", "ishopping", "mega", "paklap", "w11stop", "mistore", "mymart", "alfatah", "xcessorieshub", "eezepc", "ledshop",
  "techroid", "subhanelectronics", "jalalelectronics", "japanelectronics", "zerolifestyle", "audionic", "ronin", "baseus", "infinix",
  "alfamall", "digimall",
];

// The header's shortcuts: the categories people browse most, and the verified deals on the home page.
// Every category is in the Categories menu (CategoryMenu.jsx), so the header no longer repeats three of them as links.
const NAV = [
  { label: "Deals", to: "/#deals", hash: "#deals" },
  { label: "Price drops", to: "/drops", path: "/drops" },
  { label: "Compare", to: "/compare", path: "/compare" },
  { label: "How it works", to: "/how-it-works", path: "/how-it-works" },
];

function MainNav({ pathname, category, hash }) {
  return (
    <nav className="site-nav" aria-label="Main">
      <CategoryMenu current={category} />
      {NAV.map((item) => {
        const current = item.path ? pathname === item.path : pathname === "/" && hash === item.hash;
        return (
          <Link key={item.label} to={item.to} aria-current={current ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Header() {
  const { pathname, hash } = useLocation();
  const [params] = useSearchParams();
  // The box shows the current search on the results page; keyed so it resets when that changes (back button, new search).
  const currentQuery = pathname === "/results" ? params.get("q") ?? "" : "";
  const category = pathname === "/results" ? params.get("category") ?? "" : "";

  return (
    <header className="site-header">
      <div className={pathname === "/" ? "container site-header__inner site-header__inner--bare" : "container site-header__inner"}>
        <Link to="/" className="site-header__logo" aria-label="ShopSavvy, home">
          <Logo />
        </Link>
        {/* The home page has its own big search box, so the header one would be a duplicate there. */}
        {pathname !== "/" && (
          <div className="site-header__search">
            <SearchBox key={currentQuery} initialQuery={currentQuery} />
          </div>
        )}
        <MainNav pathname={pathname} category={category} hash={hash} />
        <ThemeToggle />
      </div>
    </header>
  );
}

function Footer() {
  // Freshness is a bonus: if the health check fails the line is simply left out.
  const health = useAsync((signal) => getHealth({ signal }), []);
  const lastScrape = health.status === "success" ? health.data.lastScrapeAt : null;

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <Logo />
          <nav className="site-footer__links" aria-label="About ShopSavvy">
            <Link to="/how-it-works">How we check prices</Link>
            <Link to="/honest-prices">How accurate we are</Link>
            <Link to="/drops">Price drops</Link>
            <Link to="/help">How to use it</Link>
            <Link to="/try">Help us test it</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
        <ul className="site-footer__stores" aria-label={`The ${STORES.length} stores we compare`}>
          {STORES.map((store) => (
            <li key={store} title={platformName(store)}>
              <StoreMark platform={store} size={24} />
              <span className="visually-hidden">{platformName(store)}</span>
            </li>
          ))}
        </ul>
        <p className="site-footer__note">
          {STORES.length} Pakistani stores, compared for free. We don't take money from stores, and prices are shown as we found them.
          {lastScrape ? ` Prices last updated ${timeAgo(lastScrape)}.` : ""}
        </p>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main" className="site-main">
        {/* keyed by path so a crash on one page does not follow the shopper to the next */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <CompareTray />
      <Footer />
    </>
  );
}
