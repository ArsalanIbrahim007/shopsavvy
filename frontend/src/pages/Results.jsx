// Results.jsx — products for a search (/results?q=iphone) or for a whole category
// (/results?category=smartphone), with filters, sorting and a comparison table per product.
//
// Everything the shopper chose lives in the URL (q, category, stores, price, sort, and each facet),
// so a view can be bookmarked or shared and the back button steps through it. The server is asked
// only when the search text or the browsed category changes; filtering and sorting happen here on
// the offers already loaded (see lib/filters.js).

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getCatalog, searchListings } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { categoryName, FEATURED_CATEGORIES } from "../lib/categories.js";
import {
  FACET_KEYS_FOR_RESET, activeCategory, applyFilters, buildFacets, categoryCounts, emptyFilters, filterGroups, filtersToParams,
  groupKey, isFiltered, parseFilters, platformOptions, priceBounds, sortGroups,
} from "../lib/filters.js";
import { formatNumber, timeAgo } from "../lib/format.js";
import { linkStoreName } from "../lib/productLink.js";
import { newestScrape, summarizeOffers } from "../lib/summary.js";
import ErrorState from "../components/ErrorState.jsx";
import FilterPanel from "../components/results/FilterPanel.jsx";
import IntegrityStrip from "../components/results/IntegrityStrip.jsx";
import LinkNotice from "../components/results/LinkNotice.jsx";
import ProductCard from "../components/ProductCard.jsx";
import SummaryCards from "../components/results/SummaryCards.jsx";
import { CardSkeleton } from "../components/Skeleton.jsx";
import "../components/results/results.css";

// The catalog serves at most 50 products per request; the list below draws PAGE at a time.
const CATALOG_LIMIT = 50;
const PAGE = 20;

function useResults(query, browseCategory) {
  return useAsync(
    async (signal) => {
      // Nothing to look up: no search text and not a category the server can browse. (Hooks run before the
      // page's early return, so without this guard a request with an empty category would be sent.)
      if (!query && !browseCategory) return { groups: [], total: 0 };
      if (query) {
        const result = await searchListings({ q: query, signal });
        return { groups: result.groups, total: result.groupCount };
      }
      const result = await getCatalog({ category: browseCategory, limit: CATALOG_LIMIT, signal });
      return { groups: result.groups, total: result.total };
    },
    [query, browseCategory]
  );
}

function Empty({ query }) {
  return (
    <div className="card" style={{ padding: "var(--space-6)", maxWidth: 560 }}>
      <h2 style={{ fontSize: "1.125rem" }}>No products found{query ? ` for "${query}"` : ""}</h2>
      <p className="muted" style={{ marginTop: "var(--space-2)" }}>
        Check the spelling, or try a shorter search such as the brand and model.
      </p>
      <p style={{ marginTop: "var(--space-4)" }}>
        <Link className="btn btn-ghost" to="/">Back to the home page</Link>
      </p>
    </div>
  );
}

/** The product cards in a grid, PAGE at a time. Keyed by the URL, so a new filter starts from the top again. */
function GroupList({ groups }) {
  const [visible, setVisible] = useState(PAGE);
  return (
    <>
      <div className="card-grid">
        {groups.slice(0, visible).map((group) => <ProductCard key={groupKey(group)} group={group} />)}
      </div>
      {groups.length > visible && (
        <button type="button" className="btn btn-ghost" onClick={() => setVisible((n) => n + PAGE)}>
          Show more products ({formatNumber(groups.length - visible)} left)
        </button>
      )}
    </>
  );
}

function ResultsView({ groups, total, query, browseCategory, filters, searchParams, setSearchParams }) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const allOffers = groups.flatMap((group) => group.offers ?? []);
  const category = activeCategory(allOffers, filters.category);
  const facets = buildFacets(allOffers, category);
  const stores = platformOptions(allOffers);
  const categories = categoryCounts(allOffers);
  const bounds = priceBounds(allOffers);

  const keptOffers = applyFilters(allOffers, filters);
  const shown = sortGroups(filterGroups(groups, keptOffers), filters.sort);
  const summary = summarizeOffers(keptOffers);
  const updated = newestScrape(allOffers);

  // When browsing a category, the category itself is not a filter the shopper can undo.
  const filtered = isFiltered(browseCategory ? { ...filters, category: "all" } : filters);

  function update(patch) {
    const next = { ...filters, ...patch };
    // Facet choices belong to one category: changing the category clears them.
    if (patch.category !== undefined && patch.category !== filters.category) {
      for (const key of FACET_KEYS_FOR_RESET) next[key] = [];
    }
    setSearchParams(withLinkOrigin(filtersToParams(next, query)));
  }

  function reset() {
    setSearchParams(withLinkOrigin(filtersToParams({ ...emptyFilters(), category: browseCategory || "all" }, query)));
  }

  // The search came from a pasted link (?from=amazon.com): keep saying so while the shopper filters.
  const linkHost = searchParams.get("from");
  const linkStore = linkStoreName(linkHost);
  const linkCapacity = searchParams.get("cap");
  function withLinkOrigin(params) {
    if (linkHost) params.set("from", linkHost);
    if (linkHost && linkCapacity) params.set("cap", linkCapacity);
    return params;
  }

  const platformCount = new Set(allOffers.map((offer) => offer.platform)).size;
  const heading = query ? `Results for "${query}"` : categoryName(browseCategory);

  return (
    <div className="container page-tall" style={{ paddingBlock: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "end", gap: "var(--space-3)" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem" }}>{heading}</h1>
          <p className="muted" role="status">
            {allOffers.length === 0
              ? "No products found."
              : `${formatNumber(allOffers.length)} ${allOffers.length === 1 ? "offer" : "offers"} across ${platformCount} ${platformCount === 1 ? "store" : "stores"}, grouped into ${formatNumber(groups.length)} ${groups.length === 1 ? "product" : "products"}`}
            {!query && total > groups.length ? `. Showing the ${groups.length} most compared of ${formatNumber(total)}; filters apply to these` : ""}
          </p>
        </div>
        {updated && <p className="small muted">Last updated {timeAgo(updated)}</p>}
      </header>

      {linkHost && query && <LinkNotice store={linkStore} query={query} capacity={linkCapacity} />}

      {allOffers.length > 0 && <SummaryCards summary={summary} />}
      <IntegrityStrip offers={keptOffers} />

      <div className="results-layout">
        <div>
          <div className="results-toolbar" style={{ marginBottom: "var(--space-3)" }}>
            <button type="button" className="btn btn-ghost filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? "Hide filters" : "Filters and sorting"}
            </button>
          </div>
          <FilterPanel
            open={filtersOpen}
            filters={filters}
            stores={stores}
            categories={categories}
            facets={facets}
            bounds={bounds}
            canPickCategory={!browseCategory}
            filtered={filtered}
            onChange={update}
            onReset={reset}
          />
        </div>

        <div className="results-list">
          {shown.length === 0 ? (
            <div className="card" style={{ padding: "var(--space-5)" }}>
              <h2 style={{ fontSize: "1.125rem" }}>No products match these filters</h2>
              <p className="muted" style={{ marginTop: "var(--space-2)" }}>Try widening the price range or removing a filter.</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: "var(--space-4)" }} onClick={reset}>Reset filters</button>
            </div>
          ) : (
            <>
              {/* the product names below are h3s; this keeps the heading levels in order (h1, h2, h3) */}
              <h2 className="visually-hidden">Products</h2>
              <GroupList key={searchParams.toString()} groups={shown} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const filters = parseFilters(searchParams);
  // Browsing without search text is only offered for the categories the server can serve (the featured ones).
  const browseCategory = !query && FEATURED_CATEGORIES.includes(filters.category) ? filters.category : "";

  const results = useResults(query, browseCategory);

  if (!query && !browseCategory) {
    return (
      <div className="container page-tall" style={{ paddingBlock: "var(--space-6)" }}>
        <Empty query="" />
      </div>
    );
  }

  if (results.status === "loading") {
    return (
      <div className="container page-tall" style={{ paddingBlock: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
        <h1 style={{ fontSize: "1.75rem" }}>{query ? `Results for "${query}"` : categoryName(browseCategory)}</h1>
        <p className="muted" role="status">
          Getting the latest prices. A search nobody has made recently can take up to a minute.
        </p>
        <div className="card-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (results.status === "error") {
    return (
      <div className="container page-tall" style={{ paddingBlock: "var(--space-6)", display: "grid", gap: "var(--space-4)" }}>
        <h1 style={{ fontSize: "1.75rem" }}>{query ? `Results for "${query}"` : categoryName(browseCategory)}</h1>
        <ErrorState error={results.error} onRetry={results.reload} />
      </div>
    );
  }

  if (results.data.groups.length === 0) {
    return (
      <div className="container page-tall" style={{ paddingBlock: "var(--space-6)", display: "grid", gap: "var(--space-4)" }}>
        <h1 style={{ fontSize: "1.75rem" }}>{query ? `Results for "${query}"` : categoryName(browseCategory)}</h1>
        <Empty query={query} />
      </div>
    );
  }

  return (
    <ResultsView
      groups={results.data.groups}
      total={results.data.total}
      query={query}
      browseCategory={browseCategory}
      filters={filters}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}
