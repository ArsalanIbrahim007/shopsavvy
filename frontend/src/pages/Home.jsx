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
import { useCountUp, useInView } from "../hooks/useCountUp.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { featuredCategories } from "../lib/categories.js";
import { showableExamples } from "../lib/caught.js";
import { pickDeals, pickMostCompared } from "../lib/homePicks.js";
import { formatNumber, timeAgo } from "../lib/format.js";
import { clearRecentSearches, getRecentSearches } from "../lib/recentSearches.js";
import CaughtCard from "../components/CaughtCard.jsx";
import CategoryIcon from "../components/CategoryIcon.jsx";
import HowWeCheck from "../components/HowWeCheck.jsx";
import DealCard from "../components/DealCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ProductCard from "../components/ProductCard.jsx";
import ProofCard from "../components/ProofCard.jsx";
import SearchBox from "../components/SearchBox.jsx";
import { CardSkeleton, Skeleton } from "../components/Skeleton.jsx";
import "./Home.css";

// Searches that are known to return good comparisons on the data we hold.
// Four, so they fit on one line under the search box (a fifth wrapped onto a line of its own).
const POPULAR_SEARCHES = ["iPhone 17 Pro Max", "Samsung Galaxy A17", "Redmi Note 15", "MacBook Air"];

function Hero({ caught }) {
  // This browser's own last searches (never sent anywhere); read once when the page opens.
  const [recent, setRecent] = useState(getRecentSearches);

  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__copy stagger">
          {/* "real" carries the promise, so it carries the colour; the lead says it in one short line (2026-11-21) */}
          <h1 className="hero__title">Know if the price is <span className="hero__mark">real</span>, before you buy</h1>
          <p className="hero__lead">21 Pakistani stores in one search. Every discount checked against its price history.</p>
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
        </div>
        <ProofCard caught={caught} />
      </div>
    </section>
  );
}

// A ring that fills as its figure counts up, from 0 each time the page opens. The ring is decoration: the figure is the text.
const RING = 2 * Math.PI * 26;
function Stat({ value, label, icon }) {
  const [ref, inView] = useInView();
  const shown = useCountUp(value ?? 0, { duration: 1600, start: inView && value != null });
  const share = value > 0 ? shown / value : 0;
  return (
    <div className="trust__item" ref={ref}>
      <svg className="trust__ring" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
        <circle className="trust__track" cx="30" cy="30" r="26" />
        <circle className="trust__fill" cx="30" cy="30" r="26" strokeDasharray={RING} strokeDashoffset={RING * (1 - share)} />
        <g className="trust__icon" transform="translate(18 18)">{icon}</g>
      </svg>
      <span className="trust__text">
        <span className="trust__value">{value == null ? "—" : formatNumber(shown)}</span>
        <span className="trust__label">{label}</span>
      </span>
    </div>
  );
}

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
const STORE_ICON = <g {...ICON}><path d="M3 9.5 4.5 4h15L21 9.5M3 9.5v10h18v-10M3 9.5h18" transform="scale(1)" /><path d="M9 19.5v-5h6v5" /></g>;
const LIST_ICON = <g {...ICON}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></g>;
const CAUGHT_ICON = <g {...ICON}><path d="M3 5.2C3 4 4 3 5.2 3h6.1c.6 0 1.1.2 1.5.6l7.6 7.6c.8.8.8 2.1 0 2.9l-6.1 6.1c-.8.8-2.1.8-2.9 0L3.6 12.6c-.4-.4-.6-.9-.6-1.5z" /><path d="M8.5 11.5l5-5" /></g>;

// Three figures, each one we can back with data: the stores and listings from the API, the caught discounts from our own checks.
function TrustRow({ stats, caught }) {
  const data = stats.status === "success" ? stats.data : null;
  const fake = caught.status === "success" ? caught.data.counts.fakeDiscount : 0;
  return (
    <section className="trust container" aria-label="What ShopSavvy checks">
      <Stat value={data?.platforms} label="stores compared on every search" icon={STORE_ICON} />
      <Stat value={data?.products} label="listings tracked, each with its update time" icon={LIST_ICON} />
      <Stat value={fake > 0 ? fake : null} label="fake discounts caught and kept off our deal lists" icon={CAUGHT_ICON} />
    </section>
  );
}

function Categories({ stats }) {
  const { hash } = useLocation();
  // the phone's tab bar "Categories" is /#categories (MobileTabBar.jsx): scroll to the tiles once they are there
  const loaded = stats.status !== "loading";
  useEffect(() => {
    if (loaded && hash === "#categories") document.getElementById("categories")?.scrollIntoView();
  }, [loaded, hash]);
  return (
    <section id="categories" className="home-section container" aria-labelledby="cat-heading" aria-busy={stats.status === "loading"}>
      <h2 id="cat-heading">Browse by category</h2>
      {stats.status === "loading" && (
        <div className="tiles">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={84} style={{ borderRadius: "var(--radius-card)" }} />)}</div>
      )}
      {stats.status === "error" && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {stats.status === "success" && (
        <div className="tiles stagger">
          {featuredCategories(stats.data.categories).map((tile) => (
            <Link key={tile.category} className="tile card" to={`/results?category=${tile.category}`}>
              <span className="tile__icon"><CategoryIcon category={tile.category} /></span>
              <span className="tile__name">{tile.name}</span>
              <span className="tile__count small">{formatNumber(tile.count)} listings</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// Two full rows of five, at most three from one category (lib/homePicks.js; 2026-11-21: eight deals left a row of three, mostly spin
// dryers and earbuds).
function Deals() {
  const deals = useAsync((signal) => getDeals({ limit: 30, signal }), []);

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
      {/* the heading with one quiet line under it (2026-11-21: the right-aligned note floated far from the heading) */}
      <div className="home-section__title">
        <h2 id="deals-heading">Verified deals</h2>
        <p className="muted home-section__sub">
          Real savings, checked against each product's price history
          {deals.status === "success" && deals.data.generatedAt && <span className="home-section__fresh"> · updated {timeAgo(deals.data.generatedAt)}</span>}
        </p>
      </div>
      <div className="card-grid">
        {deals.status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : pickDeals(deals.data.deals).map((deal) => <DealCard key={deal.lowest._id} deal={deal} />)}
      </div>
    </section>
  );
}

// The products of one category that the most stores sell, from the server's cached catalog. One row of five (a wide screen's row);
// "See all" has the rest. Picked for a home page (2026-11-21): only prices checked in the last two days (the MacBooks here said
// "Price checked 3 days ago"), and at most two of one brand (the phones row was five Xiaomis).
const MOST_COMPARED_SHOWN = 5;

function MostCompared({ category, title, allLabel }) {
  const products = useAsync((signal) => getCatalog({ category, limit: MOST_COMPARED_SHOWN * 4, signal }), [category]);
  const groups = products.status === "success" ? pickMostCompared(products.data.groups) : [];

  if (products.status === "error") return null;
  if (products.status === "success" && groups.length === 0) return null;

  return (
    <section className="home-section container" aria-labelledby={`${category}-heading`} aria-busy={products.status === "loading"}>
      <div className="home-section__head">
        <h2 id={`${category}-heading`}>{title}</h2>
        <Link to={`/results?category=${category}`}>{allLabel}</Link>
      </div>
      <div className="card-grid">
        {products.status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : groups.map((group) => <ProductCard key={group.offers[0]._id} group={group} />)}
      </div>
    </section>
  );
}

// "Deals to avoid", the page's last section (2026-11-21): the discounts our checks caught, fake "was" prices and ones above every
// other store, with the evidence. Other sites show such claims as their hottest deals; this shows what checking them is worth.
function AvoidDeals({ caught }) {
  if (caught.status !== "success" || caught.data.examples.length === 0) return null; // a bonus: nothing while loading or on error

  const { counts, examples } = caught.data;
  return (
    <section className="home-section container" aria-labelledby="avoid-heading">
      <div className="home-section__head">
        <div className="home-section__title">
          <h2 id="avoid-heading">Deals to avoid</h2>
          <p className="muted home-section__sub">
            {formatNumber(counts.fakeDiscount)} fake discounts and {formatNumber(counts.aboveMarket)} inflated "was" prices our checks
            caught and kept off the deals above. The worst right now:
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

// A shorter page (2026-11-21, "too much information"): one row each of phones and laptops; the hero's card shows four caught
// discounts and "Deals to avoid" closes the page with the rest.
export default function Home() {
  const stats = useAsync((signal) => getStats({ signal }), []);
  const fetched = useAsync((signal) => getCaught({ signal }), []);
  const caught = fetched.status === "success" ? { ...fetched, data: { ...fetched.data, examples: showableExamples(fetched.data.examples) } } : fetched;
  // the hero's card cycles through four at most (ten dots would be a row of noise)
  const heroCaught = caught.status === "success" ? { ...caught, data: { ...caught.data, examples: caught.data.examples.slice(0, 4) } } : caught;
  usePageTitle("");

  return (
    <>
      <Hero caught={heroCaught} />
      <TrustRow stats={stats} caught={caught} />
      <Categories stats={stats} />
      <Deals />
      <MostCompared category="smartphone" title="Most compared phones" allLabel="See all phones" />
      <MostCompared category="laptop" title="Most compared laptops" allLabel="See all laptops" />
      <AvoidDeals caught={caught} />
      <HowWeCheck />
    </>
  );
}
