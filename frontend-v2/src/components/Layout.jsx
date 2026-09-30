// Layout.jsx — the frame around every page: skip link, header (wordmark, search, nav), the
// page itself, and the footer. A page that crashes is caught here, so the header and footer
// (and the way back to the home page) stay on screen.

import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { getHealth } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { timeAgo } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import SearchBox from "./SearchBox.jsx";
import "./Layout.css";

const STORES = ["priceoye", "shophive", "ishopping", "telemart", "mega", "paklap", "w11stop"];

function Header() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  // The box shows the current search on the results page; keyed so it resets when that changes (back button, new search).
  const currentQuery = pathname === "/results" ? params.get("q") ?? "" : "";

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="wordmark" aria-label="ShopSavvy, home">
          Shop<span>Savvy</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/how-it-works">How it works</NavLink>
        </nav>
        {/* The home page has its own big search box, so the header one would be a duplicate there. */}
        {pathname !== "/" && (
          <div className="site-header__search">
            <SearchBox key={currentQuery} initialQuery={currentQuery} />
          </div>
        )}
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
      <div className="container">
        <p>
          <strong>ShopSavvy</strong> compares prices for electronics across {STORES.length} Pakistani stores:{" "}
          {STORES.map(platformName).join(", ")}.
        </p>
        <p className="muted">
          Free to use. We don't take money from stores, and prices are shown as we found them.
          {lastScrape ? ` Prices last updated ${timeAgo(lastScrape)}.` : ""}
        </p>
        <p>
          <Link to="/how-it-works">How we check prices</Link>
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
      <Footer />
    </>
  );
}
