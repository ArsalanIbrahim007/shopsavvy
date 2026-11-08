// Home.jsx — the front door: what the site does and a search box beside a real discount our checks caught, three figures we can
// back, the categories we cover (with real counts), verified deals, the caught discounts, the most compared products, and how
// prices are checked.
//
// Every block that depends on the server handles its own loading and failure, so one slow or
// failing request never blanks the page. The deals block hides itself when there are none: the
// server only reports savings it can verify, so the list is short by design and is never padded.

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getCatalog, getCaught, getDeals, getStats } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { featuredCategories } from "../lib/categories.js";
import { formatNumber, timeAgo } from "../lib/format.js";
import { clearRecentSearches, getRecentSearches } from "../lib/recentSearches.js";
import CaughtCard from "../components/CaughtCard.jsx";
import DealCard from "../components/DealCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ProductCard from "../components/ProductCard.jsx";
import ProofCard from "../components/ProofCard.jsx";
import SearchBox from "../components/SearchBox.jsx";
import { CardSkeleton, Skeleton } from "../components/Skeleton.jsx";
import "./Home.css";

// Searches that are known to return good comparisons on the data we hold.
const POPULAR_SEARCHES = ["iPhone 17 Pro Max", "Samsung Galaxy A17", "Redmi Note 15", "MacBook Air", "Samsung TV"];

const HOW_WE_CHECK = [
  { title: "Matched", text: "Same storage, RAM, screen and PTA status. Never 128 GB against 256 GB." },
  { title: "Checked", text: "A \"was\" price counts only if its history and other stores back it." },
  { title: "Flagged", text: "A price far out of line is marked unusual, never shown as a saving." },
];

function Hero({ caught }) {
  // This browser's own last searches (never sent anywhere); read once when the page opens.
  const [recent, setRecent] = useState(getRecentSearches);

  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__copy stagger">
          <h1 className="hero__title">Know if the price is real, before you buy</h1>
          <p className="hero__lead">One search across Pakistan's electronics stores. Every discount checked against price history.</p>
          <div className="hero__search">
            <SearchBox size="large" />
          </div>
          <p className="hero__popular small">
            <span>Try</span>
            {POPULAR_SEARCHES.map((term) => (
              <Link key={term} className="chip" to={`/results?q=${encodeURIComponent(term)}`}>{term}</Link>
            ))}
          </p>
          {recent.length > 0 && (
            <p className="hero__popular small" aria-label="Your recent searches">
              <span>Recent</span>
              {recent.map((term) => (
                <Link key={term} className="chip" to={`/results?q=${encodeURIComponent(term)}`}>{term}</Link>
              ))}
              <button type="button" className="hero__clear" onClick={() => { clearRecentSearches(); setRecent([]); }}>Clear</button>
            </p>
          )}
          <p className="hero__hint small">Seen it on Amazon, AliExpress or Temu? Paste the link to see the price here.</p>
        </div>
        <ProofCard caught={caught} />
      </div>
    </section>
  );
}

function Stat({ value, label }) {
  const shown = useCountUp(value ?? 0);
  return (
    <div className="trust__item">
      <span className="trust__value">{value == null ? "—" : formatNumber(shown)}</span>
      <span className="trust__label">{label}</span>
    </div>
  );
}

// Three figures, each one we can back with data: the stores and listings from the API, the caught discounts from our own checks.
function TrustRow({ stats, caught }) {
  const data = stats.status === "success" ? stats.data : null;
  const fake = caught.status === "success" ? caught.data.counts.fakeDiscount : 0;
  return (
    <section className="trust container" aria-label="What ShopSavvy checks">
      <Stat value={data?.platforms} label="stores compared on every search" />
      <Stat value={data?.products} label="listings tracked, each with its update time" />
      <Stat value={fake > 0 ? fake : null} label="fake discounts caught and kept off our deal lists" />
    </section>
  );
}

function Categories({ stats }) {
  return (
    <section className="home-section container" aria-labelledby="cat-heading" aria-busy={stats.status === "loading"}>
      <h2 id="cat-heading">Browse by category</h2>
      {stats.status === "loading" && (
        <div className="tiles">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={84} style={{ borderRadius: "var(--radius-card)" }} />)}</div>
      )}
      {stats.status === "error" && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {stats.status === "success" && (
        <div className="tiles stagger">
          {featuredCategories(stats.data.categories).map((tile) => (
            <Link key={tile.category} className="tile card" to={`/results?category=${tile.category}`}>
              <span className="tile__name">{tile.name}</span>
              <span className="tile__count small">{formatNumber(tile.count)} listings</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Deals() {
  const deals = useAsync((signal) => getDeals({ limit: 8, signal }), []);

  const { hash } = useLocation();
  const loaded = deals.status === "success";
  // The header's "Deals" link is /#deals; the section only exists once the data has arrived, so scroll then.
  useEffect(() => {
    if (loaded && hash === "#deals") document.getElementById("deals")?.scrollIntoView();
  }, [loaded, hash]);

  if (deals.status === "error") return null; // the section is a bonus; the rest of the page does not depend on it
  if (deals.status === "success" && deals.data.deals.length === 0) return null;

  return (
    <section id="deals" className="home-section container" aria-labelledby="deals-heading" aria-busy={deals.status === "loading"}>
      <div className="home-section__head">
        <h2 id="deals-heading">Verified deals</h2>
        {deals.status === "success" && deals.data.generatedAt && (
          <p className="small muted">Updated {timeAgo(deals.data.generatedAt)}. Only savings we can verify.</p>
        )}
      </div>
      <div className="card-grid">
        {deals.status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : deals.data.deals.map((deal) => <DealCard key={deal.lowest._id} deal={deal} />)}
      </div>
    </section>
  );
}

// "Deals we didn't show you": the discounts our checks caught, with the evidence. Other comparison sites show such claims as their
// hottest deals ("89% off" a Rs 10,000 inverter sold for Rs 94,000 elsewhere); this shows what checking them is worth.
function Caught({ caught }) {
  if (caught.status !== "success" || caught.data.examples.length === 0) return null; // a bonus: nothing while loading or on error

  const { counts, examples } = caught.data;
  return (
    <section className="home-section container" aria-labelledby="caught-heading">
      <div className="home-section__head">
        <div className="home-section__title">
          <h2 id="caught-heading">Deals we didn't show you</h2>
          <p className="muted">
            {formatNumber(counts.fakeDiscount)} fake discounts, {formatNumber(counts.aboveMarket)} inflated "was" prices and{" "}
            {formatNumber(counts.unusualPrice)} likely listing errors, kept off our deal lists. The worst:
          </p>
        </div>
        <Link to="/honest-prices">How we check</Link>
      </div>
      <div className="card-grid">
        {examples.map((item) => <CaughtCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

// The products of one category that the most stores sell, straight from the server's cached catalog. One row of five (a wide
// screen's row), not two: three sections of two identical rows made the page about 5,600 px long; "See all" has the rest.
const MOST_COMPARED_SHOWN = 5;
function MostCompared({ category, title, allLabel }) {
  const products = useAsync((signal) => getCatalog({ category, limit: MOST_COMPARED_SHOWN, signal }), [category]);

  if (products.status === "error") return null;
  if (products.status === "success" && products.data.groups.length === 0) return null;

  return (
    <section className="home-section container" aria-labelledby={`${category}-heading`} aria-busy={products.status === "loading"}>
      <div className="home-section__head">
        <h2 id={`${category}-heading`}>{title}</h2>
        <Link to={`/results?category=${category}`}>{allLabel}</Link>
      </div>
      <div className="card-grid">
        {products.status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : products.data.groups.map((group) => <ProductCard key={group.offers[0]._id} group={group} />)}
      </div>
    </section>
  );
}

function HowWeCheck() {
  return (
    <section className="home-section container" aria-labelledby="how-heading">
      <div className="home-section__head">
        <h2 id="how-heading">How we check prices</h2>
        <span className="home-section__links">
          <Link to="/how-it-works">Read the details</Link>
          <Link to="/honest-prices">See the numbers</Link>
        </span>
      </div>
      <ol className="how-steps">
        {HOW_WE_CHECK.map((item, i) => (
          <li key={item.title} className="how-step">
            <span className="how-step__num price" aria-hidden="true">0{i + 1}</span>
            <h3>{item.title}</h3>
            <p className="muted">{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Home() {
  const stats = useAsync((signal) => getStats({ signal }), []);
  const caught = useAsync((signal) => getCaught({ signal }), []);
  usePageTitle("");

  return (
    <>
      <Hero caught={caught} />
      <TrustRow stats={stats} caught={caught} />
      <Categories stats={stats} />
      <Deals />
      <Caught caught={caught} />
      <MostCompared category="smartphone" title="Most compared phones" allLabel="See all phones" />
      <MostCompared category="laptop" title="Most compared laptops" allLabel="See all laptops" />
      <MostCompared category="tv" title="Most compared TVs" allLabel="See all TVs" />
      <HowWeCheck />
    </>
  );
}
