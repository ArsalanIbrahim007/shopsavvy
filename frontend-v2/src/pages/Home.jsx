// Home.jsx — the front door: what the site does, a search box, the categories we cover (with
// real counts), verified deals, the most compared phones, and how prices are checked.
//
// Every block that depends on the server handles its own loading and failure, so one slow or
// failing request never blanks the page. The deals block hides itself when there are none: the
// server only reports savings it can verify, so the list is short by design and is never padded.

import { Link } from "react-router-dom";

import { getCatalog, getDeals, getStats } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { featuredCategories } from "../lib/categories.js";
import { formatNumber, timeAgo } from "../lib/format.js";
import DealCard from "../components/DealCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ProductCard from "../components/ProductCard.jsx";
import SearchBox from "../components/SearchBox.jsx";
import { CardSkeleton, Skeleton } from "../components/Skeleton.jsx";
import "./Home.css";

// Searches that are known to return good comparisons on the data we hold.
const POPULAR_SEARCHES = ["iPhone 17 Pro Max", "Samsung Galaxy A17", "Redmi Note 15", "MacBook Air", "Samsung TV"];

const HOW_WE_CHECK = [
  { title: "The same product, matched", text: "We compare storage, RAM, screen size and PTA status, so a 128 GB phone is never priced against a 256 GB one." },
  { title: "Every discount, checked", text: "A \"was\" price only counts if the price history and the other stores back it up. Otherwise we say so." },
  { title: "Odd prices, flagged", text: "A price far out of line with other stores is marked as unusual, and never counted as a saving." },
];

function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <h1 className="hero__title">
          Know if the price is real,
          <span className="hero__voice"> before you buy.</span>
        </h1>
        <p className="hero__lead muted">
          Compare electronics across Pakistani stores. We check every discount against price history and other stores.
        </p>
        <div className="hero__search">
          <SearchBox size="large" />
        </div>
        <p className="hero__popular small">
          <span className="muted">Popular:</span>
          {POPULAR_SEARCHES.map((term) => (
            <Link key={term} className="chip" to={`/results?q=${encodeURIComponent(term)}`}>{term}</Link>
          ))}
        </p>
      </div>
    </section>
  );
}

function Categories() {
  const stats = useAsync((signal) => getStats({ signal }), []);

  return (
    <section className="home-section container" aria-labelledby="cat-heading" aria-busy={stats.status === "loading"}>
      <h2 id="cat-heading">Browse by category</h2>
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
          <p className="small muted">
            {formatNumber(stats.data.products)} listings from {stats.data.platforms} stores.
          </p>
        </>
      )}
    </section>
  );
}

function Deals() {
  const deals = useAsync((signal) => getDeals({ limit: 8, signal }), []);

  if (deals.status === "error") return null; // the section is a bonus; the rest of the page does not depend on it
  if (deals.status === "success" && deals.data.deals.length === 0) return null;

  return (
    <section className="home-section container" aria-labelledby="deals-heading" aria-busy={deals.status === "loading"}>
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

function MostComparedPhones() {
  const phones = useAsync((signal) => getCatalog({ category: "smartphone", limit: 8, signal }), []);

  if (phones.status === "error") return null;
  if (phones.status === "success" && phones.data.groups.length === 0) return null;

  return (
    <section className="home-section container" aria-labelledby="phones-heading" aria-busy={phones.status === "loading"}>
      <div className="home-section__head">
        <h2 id="phones-heading">Most compared phones</h2>
        <Link to="/results?category=smartphone">See all phones</Link>
      </div>
      <div className="card-grid">
        {phones.status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : phones.data.groups.map((group) => <ProductCard key={group.offers[0]._id} group={group} />)}
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
            <h3>{item.title}</h3>
            <p className="muted">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Categories />
      <Deals />
      <MostComparedPhones />
      <HowWeCheck />
    </>
  );
}
