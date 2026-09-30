// Results.jsx — products for a search (/results?q=iphone) or for a whole category
// (/results?category=smartphone). Stage 1 version: a plain list of product cards, so search,
// suggestions and category tiles work end to end. Filters, sorting, the comparison table and
// URL-synced facets arrive in stage 2 (see context-frontend-v2-design.md).

import { Link, useSearchParams } from "react-router-dom";

import { getCatalog, searchListings } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { categoryName, isKnownCategory, FEATURED_CATEGORIES } from "../lib/categories.js";
import { formatNumber } from "../lib/format.js";
import ErrorState from "../components/ErrorState.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { CardSkeleton } from "../components/Skeleton.jsx";

// Drawing hundreds of cards would make the page heavy; the list is already ordered best-supported first.
const MAX_CARDS = 48;

function useResults(query, category) {
  return useAsync(
    async (signal) => {
      // Nothing to look up: no search text and not a category the server can browse. (Hooks run before the
      // page's early return below, so without this guard a request with an empty category would be sent.)
      if (!query && !FEATURED_CATEGORIES.includes(category)) return { groups: [], total: 0 };
      if (query) {
        const result = await searchListings({ q: query, category: category || undefined, signal });
        return { groups: result.groups, total: result.groupCount };
      }
      const result = await getCatalog({ category, limit: MAX_CARDS, signal });
      return { groups: result.groups, total: result.total };
    },
    [query, category]
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

export default function Results() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const rawCategory = params.get("category") ?? "";
  const category = isKnownCategory(rawCategory) ? rawCategory : "";

  const results = useResults(query, category);

  // Browsing without a search text is only offered for the categories the server can serve (the featured ones).
  if (!query && !FEATURED_CATEGORIES.includes(category)) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-6)" }}>
        <Empty query="" />
      </div>
    );
  }

  const heading = query ? `Results for "${query}"` : categoryName(category);

  return (
    <div className="container" style={{ paddingBlock: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "1.75rem" }}>{heading}</h1>
        {results.status === "success" && (
          <p className="muted" role="status">
            {results.data.total === 0
              ? "No products found."
              : `${formatNumber(results.data.total)} ${results.data.total === 1 ? "product" : "products"}${results.data.total > MAX_CARDS ? `, showing the ${MAX_CARDS} with the most offers` : ""}`}
          </p>
        )}
      </header>

      {results.status === "loading" && (
        <>
          <p className="muted" role="status">
            Getting the latest prices. A search nobody has made recently can take up to a minute.
          </p>
          <div className="card-grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
          </div>
        </>
      )}

      {results.status === "error" && <ErrorState error={results.error} onRetry={results.reload} />}

      {results.status === "success" && results.data.groups.length === 0 && <Empty query={query} />}

      {results.status === "success" && results.data.groups.length > 0 && (
        <div className="card-grid">
          {results.data.groups.slice(0, MAX_CARDS).map((group) => (
            <ProductCard key={group.offers[0]._id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
