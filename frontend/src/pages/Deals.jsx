// Deals.jsx — "Verified deals" as a page of its own (2026-11-29): the header's "Deals" link went to /#deals, a section of the home
// page that only exists once its data has arrived, so the link often led nowhere (clicked on the home page itself the address did
// not change, and the sections above it moved it as they loaded). Like Price drops: GET /api/listings/deals, narrowed to one
// category with ?category= (shareable), biggest saving first.

import { Link, useSearchParams } from "react-router-dom";

import { getDeals } from "../api/endpoints.js";
import CategoryIcon from "../components/CategoryIcon.jsx";
import DealCard from "../components/DealCard.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { CardSkeleton } from "../components/Skeleton.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { usePageDescription, usePageTitle } from "../hooks/usePageTitle.js";
import { FEATURED_CATEGORIES, categoryName } from "../lib/categories.js";
import { timeAgo } from "../lib/format.js";
import "../components/cards.css";
import PageHero from "../components/PageHero.jsx";
import "./PriceDrops.css";

export const DEALS_SHOWN = 48;

export default function Deals() {
  const [params] = useSearchParams();
  const asked = params.get("category") ?? "";
  const category = FEATURED_CATEGORIES.includes(asked) ? asked : ""; // anything else shows all, rather than an error page
  const deals = useAsync((signal) => getDeals({ category: category || undefined, limit: DEALS_SHOWN, signal }), [category]);
  usePageTitle(category ? `${categoryName(category)} deals` : "Verified deals");
  usePageDescription("Real savings on electronics in Pakistan: prices below the product's usual price, with every discount checked against its price history.");
  const list = deals.status === "success" ? deals.data.deals : [];
  const biggest = Math.max(0, ...list.map((deal) => Number(deal.savingPercent) || 0));

  return (
    <div className="container drops-page">
      <PageHero icon="accuracy" eyebrow="Every discount checked" title="Verified deals"
        lead="Products selling below their usual price right now, whose discount passed our checks against the price history and other stores' prices.">
        {biggest > 0 && (
          <p className="drops-page__stat">
            <span className="drops-page__stat-value price">{Math.round(biggest)}% below</span>
            <span className="small muted">the usual price, the biggest saving {category ? `in ${categoryName(category).toLowerCase()}` : "right now"}</span>
          </p>
        )}
      </PageHero>

      <nav className="drops-page__filter" aria-label="Category">
        <Link className="chip" to="/deals" aria-current={category === "" ? "page" : undefined}>All</Link>
        {FEATURED_CATEGORIES.map((id) => (
          <Link key={id} className="chip" to={`/deals?category=${id}`} aria-current={category === id ? "page" : undefined}>
            <CategoryIcon category={id} size={16} />
            {categoryName(id)}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="deals-list" aria-busy={deals.status === "loading"}>
        <h2 id="deals-list" className="visually-hidden">{category ? `Deals in ${categoryName(category)}` : "All verified deals"}</h2>
        {deals.status === "error" && <ErrorState error={deals.error} onRetry={deals.reload} />}

        {deals.status === "loading" && (
          <div className="card-grid">{Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}</div>
        )}

        {deals.status === "success" && list.length === 0 && (
          <p className="drops-page__empty">
            No {category ? `${categoryName(category).toLowerCase()} ` : ""}deal passes our checks right now. Prices are checked every
            night, so look again tomorrow, or see the <Link to={category ? `/drops?category=${category}` : "/drops"}>price drops</Link>.
          </p>
        )}

        {deals.status === "success" && list.length > 0 && (
          <>
            <p className="small muted drops-page__count">
              {list.length} {list.length === 1 ? "deal" : "deals"}, biggest saving first
              {deals.data.generatedAt ? ` · updated ${timeAgo(deals.data.generatedAt)}` : ""}
            </p>
            <div className="card-grid">
              {list.map((deal) => <DealCard key={deal.lowest?._id ?? deal.productName} deal={deal} />)}
            </div>
          </>
        )}
      </section>

      <p className="small muted drops-page__rules">
        A deal is a price clearly below the product&apos;s usual price whose discount was not found fake or doubtful: see{" "}
        <Link to="/how-it-works">how we check prices</Link>.
      </p>
    </div>
  );
}
