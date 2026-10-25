// PriceDrops.jsx — "Price drops": offers whose price came down since the store's previous check, from GET /api/listings/drops.
// The server decides what counts (and sends its thresholds); this page shows the list, lets the shopper narrow it to one category
// (?category=, so the view can be shared), and says plainly what the rules are and that the "was" price is our own record.

import { Link, useSearchParams } from "react-router-dom";

import { getPriceDrops } from "../api/endpoints.js";
import DropCard from "../components/DropCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { CardSkeleton } from "../components/Skeleton.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { FEATURED_CATEGORIES, categoryName } from "../lib/categories.js";
import { rulesSentence } from "../lib/drops.js";
import { timeAgo } from "../lib/format.js";
import "../components/cards.css";
import "./PriceDrops.css";

export default function PriceDrops() {
  const [params] = useSearchParams();
  const asked = params.get("category") ?? "";
  const category = FEATURED_CATEGORIES.includes(asked) ? asked : ""; // anything else shows all, rather than an error page
  const drops = useAsync((signal) => getPriceDrops({ category: category || undefined, limit: 48, signal }), [category]);
  usePageTitle(category ? `${categoryName(category)} price drops` : "Price drops");

  return (
    <div className="container drops-page">
      <header className="drops-page__head">
        <h1>Price drops</h1>
        <p className="muted">
          Prices that came down since the store's previous check. The "was" price is the one we recorded ourselves, not the
          store's own crossed-out price.
        </p>
      </header>

      <nav className="drops-page__filter" aria-label="Category">
        <Link className="chip" to="/drops" aria-current={category === "" ? "page" : undefined}>All</Link>
        {FEATURED_CATEGORIES.map((id) => (
          <Link key={id} className="chip" to={`/drops?category=${id}`} aria-current={category === id ? "page" : undefined}>
            {categoryName(id)}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="drops-list" aria-busy={drops.status === "loading"}>
        <h2 id="drops-list" className="visually-hidden">{category ? `Price drops in ${categoryName(category)}` : "All price drops"}</h2>
        {drops.status === "error" && <ErrorState error={drops.error} onRetry={drops.reload} />}

        {drops.status === "loading" && (
          <div className="card-grid">{Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}</div>
        )}

        {drops.status === "success" && drops.data.drops.length === 0 && (
          <p className="drops-page__empty">
            No price {category ? `in ${categoryName(category).toLowerCase()} ` : ""}has dropped by a real margin in the last couple
            of days. Prices are checked every night, so look again tomorrow.
          </p>
        )}

        {drops.status === "success" && drops.data.drops.length > 0 && (
          <>
            <p className="small muted drops-page__count">
              {drops.data.drops.length} {drops.data.drops.length === 1 ? "offer" : "offers"}, biggest drop first
              {drops.data.generatedAt ? ` · updated ${timeAgo(drops.data.generatedAt)}` : ""}
            </p>
            <div className="card-grid">
              {drops.data.drops.map((item) => <DropCard key={item._id} item={item} />)}
            </div>
          </>
        )}
      </section>

      <p className="small muted drops-page__rules">{rulesSentence(drops.status === "success" ? drops.data.rules : null)}</p>
    </div>
  );
}
