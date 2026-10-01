// Layout.jsx — the frame around every page: skip link, header (logo, search, category links), the
// page itself, and the footer. A page that crashes is caught here, so the header and footer
// (and the way back to the home page) stay on screen.

import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { getHealth } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { timeAgo } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBox from "./SearchBox.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import "./Layout.css";

const STORES = ["priceoye", "shophive", "ishopping", "telemart", "mega", "paklap", "w11stop", "mistore", "mymart", "alfatah", "xcessorieshub", "eezepc", "ledshop"];

// The header's shortcuts: the categories people browse most, and the verified deals on the home page.
const NAV = [
  { label: "Phones", to: "/results?category=smartphone", category: "smartphone" },
  { label: "Laptops", to: "/results?category=laptop", category: "laptop" },
  { label: "TVs", to: "/results?category=tv", category: "tv" },
  { label: "Deals", to: "/#deals", hash: "#deals" },
];

function MainNav({ pathname, category, hash }) {
  return (
    <nav className="site-nav" aria-label="Main">
      {NAV.map((item) => {
        const current = item.category
          ? pathname === "/results" && category === item.category
          : pathname === "/" && hash === item.hash;
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
      <div className="container site-header__inner">
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
        <div>
          <Logo inverse />
          <p className="site-footer__tag">Find the best price in Pakistan.</p>
        </div>
        <div className="site-footer__text">
          <p>
            ShopSavvy compares prices for electronics across {STORES.length} Pakistani stores:{" "}
            {STORES.map(platformName).join(", ")}.
          </p>
          <p>
            Free to use. We don't take money from stores, and prices are shown as we found them.
            {lastScrape ? ` Prices last updated ${timeAgo(lastScrape)}.` : ""}
          </p>
          <p><Link to="/how-it-works">How we check prices</Link></p>
        </div>
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
