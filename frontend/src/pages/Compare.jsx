// Compare.jsx — 2 to 4 products side by side: price and where, how many stores sell it, PTA status, the specifications the stores'
// own pages state (with the best value of each row marked), the Specs score and where it ranks among products priced like it.
// The products come from ?ids= (a shareable address) or, without it, from the list picked with the Compare buttons (lib/compare.js).
// The data is GET /api/listings/compare; nothing here is invented: a value no store's page states is shown as not stated.

import { Link, useSearchParams } from "react-router-dom";

import { compareProducts } from "../api/endpoints.js";
import ErrorState from "../components/ErrorState.jsx";
import ProductImage from "../components/ProductImage.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { categoryName } from "../lib/categories.js";
import { COMPARE_MAX, clearCompare, compareIds, removeFromCompare } from "../lib/compare.js";
import { formatPrice, formatPta } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { productPath } from "../lib/productPath.js";
import { safeExternalUrl } from "../lib/safeLink.js";
import { bestOf, formatSpec, SPEC_FIELDS } from "../lib/specs.js";
import "../components/Compare.css";

// A rank among one or two products says nothing ("#1 of 1"): shown from three products priced alike.
const rankText = (rank, category) =>
  rank && rank.of >= 3 ? `#${rank.rank} of ${rank.of} ${categoryName(category).toLowerCase()} priced ${formatPrice(rank.band.min)}–${formatPrice(rank.band.max)}` : null;

function Empty() {
  return (
    <div className="compare-empty card">
      <h2>Pick products to compare</h2>
      <p>
        Press <strong>Compare</strong> on two to {COMPARE_MAX} products of the same kind (on the results or a product page). They stay
        picked while you browse; the bar at the foot of the page opens the comparison.
      </p>
      <Link className="btn btn-primary" to="/results?category=smartphone">Browse phones</Link>
    </div>
  );
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const ids = compareIds(params.get("ids"));
  usePageTitle("Compare");
  const key = ids.join(",");
  const result = useAsync((signal) => (ids.length >= 2 ? compareProducts(ids, { signal }) : Promise.resolve({ products: [] })), [key]);

  function remove(id) {
    removeFromCompare(id);
    const rest = ids.filter((i) => i !== id);
    setParams(rest.length ? { ids: rest.join(",") } : {});
  }

  if (ids.length < 2) {
    return (
      <div className="container compare page-tall">
        <h1>Compare</h1>
        <Empty />
      </div>
    );
  }

  if (result.status === "loading") {
    return (
      <div className="container compare page-tall" aria-busy="true">
        <h1>Compare</h1>
        <Skeleton height={320} />
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="container compare page-tall">
        <h1>Compare</h1>
        <ErrorState error={result.error} onRetry={result.reload} />
      </div>
    );
  }

  const products = result.data.products;
  const fields = SPEC_FIELDS.filter(({ field }) => products.some((p) => p.specs?.[field] !== undefined && p.specs?.[field] !== null));
  const sources = [...new Set(products.flatMap((p) => p.specsFrom ?? []))].map(platformName);
  const lowest = products.map((p) => p.lowestPrice).filter((v) => v > 0);
  const cheapest = lowest.length >= 2 ? Math.min(...lowest) : null;
  const scores = products.map((p) => p.specScore?.score ?? null);
  const topScore = scores.filter((s) => s !== null).length >= 2 ? Math.max(...scores.filter((s) => s !== null)) : null;
  const notStated = <span className="muted" aria-label="Not stated">—</span>;

  return (
    <div className="container compare page-tall">
      <div className="compare__head">
        <h1>Compare {products.length} {categoryName(products[0]?.category ?? "").toLowerCase()}</h1>
        <button type="button" className="btn btn-ghost" onClick={() => { clearCompare(); setParams({}); }}>Clear all</button>
      </div>

      <div className="compare-scroll" role="region" aria-label="Comparison table" tabIndex={0}>
        <table className="compare-table">
          <thead>
            <tr>
              <td className="compare-table__corner" />
              {products.map((p) => (
                <th key={p.id} scope="col" className="compare-table__product">
                  <ProductImage src={p.image} alt="" height={110} />
                  <Link to={productPath(p.id, p.name)} className="compare-table__name">{p.name}</Link>
                  <button type="button" className="compare-table__remove small" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Lowest price</th>
              {products.map((p) => (
                <td key={p.id} className={p.lowestPrice === cheapest ? "is-best" : undefined}>
                  {p.lowestPrice ? <span className="price">{formatPrice(p.lowestPrice)}</span> : notStated}
                  {p.lowestPrice === cheapest && <span className="compare-best"> Cheapest</span>}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Best deal</th>
              {products.map((p) => {
                const url = safeExternalUrl(p.bestOffer?.url);
                return (
                  <td key={p.id}>
                    {p.bestOffer ? (
                      <>
                        {formatPrice(p.bestOffer.price)} at {platformName(p.bestOffer.platform)}
                        {url && <> · <a href={url} target="_blank" rel="noopener noreferrer nofollow">Visit store</a></>}
                      </>
                    ) : notStated}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row">Stores</th>
              {products.map((p) => <td key={p.id}>{p.stores} {p.stores === 1 ? "store" : "stores"} · {p.offerCount} {p.offerCount === 1 ? "offer" : "offers"}</td>)}
            </tr>
            {products.some((p) => p.ptaStatus && p.ptaStatus !== "unknown") && (
              <tr>
                <th scope="row">PTA</th>
                {products.map((p) => <td key={p.id}>{p.ptaStatus && p.ptaStatus !== "unknown" ? formatPta(p.ptaStatus) : notStated}</td>)}
              </tr>
            )}
            <tr>
              <th scope="row">
                Specs score
                <span className="small muted compare-table__hint">out of 100, from the specs known</span>
              </th>
              {products.map((p, i) => (
                <td key={p.id} className={scores[i] !== null && scores[i] === topScore ? "is-best" : undefined}>
                  {p.specScore ? (
                    <>
                      <strong>{p.specScore.score}</strong>
                      <span className="small muted"> from {p.specScore.parts.length} specs</span>
                      {scores[i] === topScore && <span className="compare-best"> Best</span>}
                      {rankText(p.rank, p.category) && <span className="small muted compare-table__rank">{rankText(p.rank, p.category)}</span>}
                    </>
                  ) : <span className="small muted">Too few specs to score</span>}
                </td>
              ))}
            </tr>
            {fields.map(({ field, label }) => {
              const values = products.map((p) => p.specs?.[field]);
              const best = new Set(bestOf(field, values));
              return (
                <tr key={field}>
                  <th scope="row">{label}</th>
                  {products.map((p, i) => {
                    const shown = formatSpec(field, values[i]);
                    return (
                      <td key={p.id} className={best.has(i) ? "is-best" : undefined}>
                        {shown ?? notStated}
                        {best.has(i) && <span className="compare-best"> Best</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="small muted compare__note">
        {fields.length > 0
          ? <>Specifications from the stores&apos; own product pages{sources.length ? ` (${sources.join(", ")})` : ""}; RAM and storage from the listing&apos;s title, which names the variant sold. A dash means no store&apos;s page states it. The specs score rates the known values for the category (a phone with 12 GB of RAM scores higher than one with 4 GB), so a product is never marked down for a spec a store left out.</>
          : <>No store&apos;s page we read states specifications for these products yet: they are read a few each night.</>}
      </p>
    </div>
  );
}
