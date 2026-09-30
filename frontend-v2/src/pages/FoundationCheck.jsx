// FoundationCheck.jsx — a throwaway page that exercises the whole data layer against
// the real backend: health, stats, a search, and how each kind of failure is
// described. It carries no design on purpose. It is deleted when the real pages land.

import { useState } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { getHealth, getStats, searchListings, getListing } from "../api/endpoints.js";
import { describeError } from "../api/errors.js";
import { formatPrice, timeAgo } from "../lib/format.js";
import { summarizeOffers } from "../lib/summary.js";
import { applyFilters, buildFacets, activeCategory, emptyFilters, sortGroups, filterGroups } from "../lib/filters.js";

function Status({ state, children }) {
  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") {
    const info = describeError(state.error);
    return (
      <p role="alert">
        <strong>{info.title}</strong> — {info.message} {info.reference} <button onClick={state.reload}>Retry</button>
      </p>
    );
  }
  return children(state.data);
}

export default function FoundationCheck() {
  const [query, setQuery] = useState("vivo y31d");
  const health = useAsync((signal) => getHealth({ signal }), []);
  const stats = useAsync((signal) => getStats({ signal }), []);
  const search = useAsync((signal) => searchListings({ q: query, signal }), [query]);
  const missing = useAsync((signal) => getListing("000000000000000000000000", { signal }), []);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 820, margin: "24px auto", padding: "0 16px" }}>
      <h1>ShopSavvy v2: foundation check</h1>
      <p>No design yet. This proves the data layer, error handling and logic against the live backend.</p>

      <h2>Health</h2>
      <Status state={health}>{(h) => <p>{h.status}, database {h.db}, last scrape {timeAgo(h.lastScrapeAt)}</p>}</Status>

      <h2>Stats</h2>
      <Status state={stats}>{(s) => <p>{s.products} products, {s.platforms} platforms</p>}</Status>

      <h2>A missing listing (shows how an error is described)</h2>
      <Status state={missing}>{() => <p>unexpectedly found</p>}</Status>

      <h2>Search</h2>
      <input aria-label="query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Status state={search}>
        {({ offers, groups }) => {
          const summary = summarizeOffers(offers);
          const filters = emptyFilters();
          const kept = applyFilters(offers, filters);
          const ordered = sortGroups(filterGroups(groups, kept), filters.sort);
          const facets = buildFacets(offers, activeCategory(offers, "all"));
          return (
            <>
              <p>
                {summary.count} offers from {summary.platformCount} stores, {ordered.length} products; lowest{" "}
                {summary.lowest ? formatPrice(summary.lowest.price) : "—"}; data{" "}
                {summary.updatedAt ? timeAgo(summary.updatedAt) : "of unknown age"}; {summary.flagged} flagged.
              </p>
              <p>Filters offered: {facets.map((f) => f.title).join(", ") || "none"}</p>
              <ul>
                {ordered.map((g) => (
                  <li key={g.offers[0]._id}>
                    {g.productName}: {g.offers.map((o) => `${o.platform} ${formatPrice(o.price)}`).join(", ")}
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </Status>
    </main>
  );
}
