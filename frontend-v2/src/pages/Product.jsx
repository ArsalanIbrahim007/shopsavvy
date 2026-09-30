// Product.jsx — one product and every store's offer for it, side by side (reached by clicking a card).
// The top is the comparison: photo, name, verdict, best price, and the offers table with deal scores.
// Below it, about the listing the shopper opened: the three checks behind its verdict (with the server's
// reasons), every store's price history, the price alert form, the specifications, and the cross-store summary.

import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import { getListing } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { platformName } from "../lib/platforms.js";
import ErrorState from "../components/ErrorState.jsx";
import AlertForm from "../components/product/AlertForm.jsx";
import CrossStoreSummary from "../components/product/CrossStoreSummary.jsx";
import DealVerdict from "../components/product/DealVerdict.jsx";
import PriceHistoryChart from "../components/product/PriceHistoryChart.jsx";
import Specifications from "../components/product/Specifications.jsx";
import ResultGroup from "../components/results/ResultGroup.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import "../components/product/product.css";
import "./Product.css";

function Explainer() {
  return (
    <section className="explain card" aria-labelledby="explain-heading">
      <h2 id="explain-heading">How we check a discount</h2>
      <p className="muted">A store's "was" price is only a claim. We test it in three ways, and show you the reason for each result:</p>
      <ul>
        <li><strong>Against this listing's own history.</strong> If the price was never anywhere near the claimed one, the discount is flagged. This needs at least three recorded prices, so a new listing stays "unverified".</li>
        <li><strong>Against the other stores.</strong> A "was" price above anything other stores charge for the same product is marked as above market.</li>
        <li><strong>Against what is plausible.</strong> A price far out of line with every other store is marked unusual, and is never counted as the lowest price or a saving.</li>
      </ul>
      <p className="small"><Link to="/how-it-works">Read more about how ShopSavvy checks prices</Link></p>
    </section>
  );
}

export default function Product() {
  const { id } = useParams();
  const { state } = useLocation();
  const product = useAsync((signal) => getListing(id, { signal }), [id]);

  // The chosen colour lives in the address (?colour=Blue), so a colour can be shared and survives a reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const colour = searchParams.get("colour");
  const chooseColour = (next) => setSearchParams((params) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set("colour", next);
    else updated.delete("colour");
    return updated;
  }, { replace: true, state });

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
  // The API always includes the listing itself; the fallback only guards an empty answer.
  const allOffers = offers.length > 0 ? offers : [listing];
  const group = { productName: clickedName || productGroup?.productName || listing.title, offers: allOffers };

  return (
    <div className="container product">
      {back}
      <ResultGroup group={group} currentId={listing._id} colour={colour} onColour={chooseColour} />

      <section className="product-section" aria-labelledby="verdict-heading">
        <h2 id="verdict-heading">Deal verdict for {platformName(listing.platform)}</h2>
        <DealVerdict listing={listing} />
      </section>

      <section className="product-section" aria-labelledby="history-heading">
        <h2 id="history-heading">Price history</h2>
        <PriceHistoryChart offers={allOffers} currentId={listing._id} />
      </section>

      <div className="product-facts">
        <section className="product-section" aria-labelledby="alert-heading">
          <h2 id="alert-heading">Price alert</h2>
          <AlertForm listing={listing} />
        </section>
        <div className="product-section">
          <CrossStoreSummary offers={allOffers} />
          <Specifications listing={listing} />
        </div>
      </div>

      <Explainer />
    </div>
  );
}
