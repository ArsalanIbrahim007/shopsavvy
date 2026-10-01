// Home.jsx — the front door: what the site does, a search box, the categories we cover (with
// real counts), verified deals, the most compared phones, and how prices are checked.
//
// Every block that depends on the server handles its own loading and failure, so one slow or
// failing request never blanks the page. The deals block hides itself when there are none: the
// server only reports savings it can verify, so the list is short by design and is never padded.

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getCatalog, getDeals, getStats } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { featuredCategories } from "../lib/categories.js";
import { formatNumber, timeAgo } from "../lib/format.js";
import { clearRecentSearches, getRecentSearches } from "../lib/recentSearches.js";
import DealCard from "../components/DealCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ProductCard from "../components/ProductCard.jsx";
import SearchBox from "../components/SearchBox.jsx";
import { CardSkeleton, Skeleton } from "../components/Skeleton.jsx";
import "./Home.css";

// Searches that are known to return good comparisons on the data we hold.
const POPULAR_SEARCHES = ["iPhone 17 Pro Max", "Samsung Galaxy A17", "Redmi Note 15", "MacBook Air", "Samsung TV"];

const HOW_WE_CHECK = [
  { step: "Step 1", title: "The same product, matched", text: "We compare storage, RAM, screen size and PTA status, so a 128 GB phone is never priced against a 256 GB one." },
  { step: "Step 2", title: "Every discount, checked", text: "A \"was\" price only counts if the price history and the other stores back it up. Otherwise we say so." },
  { step: "Step 3", title: "Odd prices, flagged", text: "A price far out of line with other stores is marked as unusual, and never counted as a saving." },
];

function Hero() {
  // This browser's own last searches (never sent anywhere); read once when the page opens.
  const [recent, setRecent] = useState(getRecentSearches);

  return (
    <section className="hero">
      <div className="container hero__inner">
        <span className="hero__eyebrow">Price comparison for Pakistan</span>
        <h1 className="hero__title">
          Know if the price is real, <span className="hero__accent">before you buy.</span>
        </h1>
        <p className="hero__lead">
          Compare electronics across Pakistani stores. We check every discount against price history and other stores.
        </p>
        <div className="hero__search">
          <SearchBox size="large" />
        </div>
        <p className="hero__lead small">
          Seen it on Amazon, AliExpress or Temu? Paste the link above to see what it costs in Pakistan.
        </p>
        <p className="hero__popular small">
          <span>Popular:</span>
          {POPULAR_SEARCHES.map((term) => (
            <Link key={term} className="chip" to={`/results?q=${encodeURIComponent(term)}`}>{term}</Link>
          ))}
        </p>
        {recent.length > 0 && (
          <p className="hero__popular small" aria-label="Your recent searches">
            <span>Recent:</span>
            {recent.map((term) => (
              <Link key={term} className="chip" to={`/results?q=${encodeURIComponent(term)}`}>{term}</Link>
            ))}
            <button type="button" className="hero__clear" onClick={() => { clearRecentSearches(); setRecent([]); }}>Clear</button>
          </p>
        )}
      </div>
    </section>
  );
}

// Only claims we can back with data: the store count and listing count come from the API, and the
// other two describe checks the backend really runs.
function TrustRow({ stats }) {
  const items = [
    { value: stats.status === "success" ? `${stats.data.platforms} stores` : "Stores", label: "compared on every search" },
    { value: stats.status === "success" ? `${formatNumber(stats.data.products)} listings` : "Listings", label: "tracked, each with its update time" },
    { value: "Discount checks", label: "against price history and other stores" },
    { value: "Unusual prices", label: "flagged, never counted as savings" },
  ];

  return (
    <section className="trust container" aria-label="What ShopSavvy checks">
      <div className="trust__grid card">
        {items.map((item) => (
          <div key={item.value} className="trust__item">
            <span className="trust__value">{item.value}</span>
            <span className="trust__label">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Categories({ stats }) {
  return (
    <section className="home-section container" aria-labelledby="cat-heading" aria-busy={stats.status === "loading"}>
      <div>
        <p className="eyebrow">Catalog</p>
        <h2 id="cat-heading">Browse by category</h2>
      </div>
      {stats.status === "loading" && (
        <div className="tiles">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={84} style={{ borderRadius: "var(--radius-card)" }} />)}</div>
      )}
      {stats.status === "error" && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {stats.status === "success" && (
        <>
          <div className="tiles">
            {featuredCategories(stats.data.categories).map((tile) => (
              <Link key={tile.category} className="tile card" to={`/results?category=${tile.category}`}>
                <span className="tile__name">{tile.name}</span>
                <span className="tile__count small muted">{formatNumber(tile.count)} listings</span>
              </Link>
            ))}
          </div>
        </>
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

// The products of one category that the most stores sell, straight from the server's cached catalog.
function MostCompared({ category, title, allLabel }) {
  const products = useAsync((signal) => getCatalog({ category, limit: 8, signal }), [category]);

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
        <Link to="/how-it-works">Read the details</Link>
      </div>
      <div className="how-grid">
        {HOW_WE_CHECK.map((item) => (
          <div key={item.title} className="card how-card">
            <p className="how-card__step">{item.step.toUpperCase()}</p>
            <h3>{item.title}</h3>
            <p className="muted">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const stats = useAsync((signal) => getStats({ signal }), []);

  return (
    <>
      <Hero />
      <TrustRow stats={stats} />
      <Categories stats={stats} />
      <Deals />
      <MostCompared category="smartphone" title="Most compared phones" allLabel="See all phones" />
      <MostCompared category="laptop" title="Most compared laptops" allLabel="See all laptops" />
      <MostCompared category="tv" title="Most compared TVs" allLabel="See all TVs" />
      <HowWeCheck />
    </>
  );
}
