// Product.jsx — one product and every store's offer for it, side by side: photo, name, verdict,
// best price and the saving, then the offers table (cheapest first, the lowest marked, the listing
// the shopper opened labelled). Reached by clicking a card in the results or on the home page.
// The verdict panel, price-history chart, variant picker and alert form arrive in stage 3.

import { Link, useLocation, useParams } from "react-router-dom";

import { getListing } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import ErrorState from "../components/ErrorState.jsx";
import ResultGroup from "../components/results/ResultGroup.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import "./Product.css";

export default function Product() {
  const { id } = useParams();
  const { state } = useLocation();
  const product = useAsync((signal) => getListing(id, { signal }), [id]);

  // The card that led here remembers the list it was in (filters and all), so "Back" returns to it.
  // Only a path inside this site is followed ("//host" and full addresses are not).
  const from = typeof state?.from === "string" && /^\/(?!\/)/.test(state.from) ? state.from : null;
  const back = (
    <p className="small">
      <Link to={from ?? "/"}>{from ? "← Back to results" : "← Home"}</Link>
    </p>
  );

  if (product.status === "loading") {
    return (
      <div className="container product" aria-busy="true">
        {back}
        <Skeleton height={28} width="60%" />
        <Skeleton height={260} />
      </div>
    );
  }

  if (product.status === "error") {
    return (
      <div className="container product">
        {back}
        <ErrorState error={product.error} onRetry={product.reload} />
      </div>
    );
  }

  const { listing, offers, productGroup } = product.data;
  const clickedName = typeof state?.name === "string" && state.name.trim() ? state.name : null;
  const group = {
    productName: clickedName || productGroup?.productName || listing.title,
    // The API always includes the listing itself; the fallback only guards an empty answer.
    offers: offers.length > 0 ? offers : [listing],
  };

  return (
    <div className="container product">
      {back}
      <ResultGroup group={group} currentId={listing._id} />
    </div>
  );
}
