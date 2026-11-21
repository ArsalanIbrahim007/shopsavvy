// Layout.jsx — the frame around every page: skip link, header (logo, search, category links), the
// page itself, and the footer. A page that crashes is caught here, so the header and footer
// (and the way back to the home page) stay on screen.

import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigationType, useSearchParams } from "react-router-dom";

import { platformName } from "../lib/platforms.js";
import CategoryMenu from "./CategoryMenu.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBox from "./SearchBox.jsx";
import { StoreMark } from "./StoreLogo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import CompareTray from "./CompareTray.jsx";
import MobileTabBar from "./MobileTabBar.jsx";
import "./Layout.css";

// The stores read every night (the final report's 21). Paklap (its bot check refuses our crawler) and W11Stop (dropped 19 Nov) are
// not listed: the backend hides them too (config/platforms.js).
const STORES = [
  "priceoye", "shophive", "ishopping", "mega", "mistore", "mymart", "alfatah", "xcessorieshub", "eezepc", "ledshop",
  "techroid", "subhanelectronics", "jalalelectronics", "japanelectronics", "zerolifestyle", "audionic", "ronin", "baseus", "infinix",
  "alfamall", "digimall",
];

// The header's shortcuts: the verified deals on the home page, price drops and the comparison. Every category is in the Categories
// menu (CategoryMenu.jsx). "How it works" moved to the footer (2026-11-21): beside the search box it wrapped onto a second line.
const NAV = [
  { label: "Deals", to: "/#deals", hash: "#deals" },
  { label: "Price drops", to: "/drops", path: "/drops" },
  { label: "Compare", to: "/compare", path: "/compare" },
];

/**
 * A new page starts at its top. Without this the product page opened at the height the results list had been scrolled to
 * (found 2026-11-21). The back and forward buttons keep the browser's own place, and a link to a section (/#deals) scrolls there.
 */
function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  const navigation = useNavigationType();
  useEffect(() => {
    if (navigation !== "POP" && !hash) window.scrollTo(0, 0);
  }, [pathname, search, hash, navigation]);
  return null;
}

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

// The footer says less (2026-11-21): the stores fold behind one line, and "Prices last updated" is gone (the deals say when they
// were updated, and every product says when its price was checked).
function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <Logo />
          <nav className="site-footer__links" aria-label="About ShopSavvy">
            <Link to="/how-it-works">How it works</Link>
            <Link to="/honest-prices">How accurate we are</Link>
            <Link to="/drops">Price drops</Link>
            <Link to="/help">How to use it</Link>
            <Link to="/try">Help us test it</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
        <p className="site-footer__note">
          {STORES.length} Pakistani stores, compared for free. We don't take money from stores, and prices are shown as we found them.
        </p>
        <details className="site-footer__more">
          <summary>See the {STORES.length} stores we compare</summary>
          <ul className="site-footer__stores" aria-label={`The ${STORES.length} stores we compare`}>
            {STORES.map((store) => (
              <li key={store}>
                <StoreMark platform={store} size={18} />
                <span>{platformName(store)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <>
      <ScrollToTop />
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
      <MobileTabBar />
    </>
  );
}
