// Product.jsx — one product and where to buy it. Stage 1 version: the listing, its best offer
// and the other stores' offers in a plain table, with honest not-found / error states. The
// verdict panel, price-history chart, variant picker and alert form arrive in stage 3.

import { Link, useParams } from "react-router-dom";

import { getListing } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { formatPrice, timeAgo } from "../lib/format.js";
import { platformName } from "../lib/platforms.js";
import { offerLink } from "../lib/safeLink.js";
import { offerFlags, recommendationOf } from "../lib/verdicts.js";
import { summarizeOffers } from "../lib/summary.js";
import ErrorState from "../components/ErrorState.jsx";
import ProductImage from "../components/ProductImage.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import VerdictBadge from "../components/VerdictBadge.jsx";
import "./Product.css";

function StoreButton({ offer }) {
  const href = offerLink(offer);
  // No safe link: shown as unavailable rather than pointing somewhere untrusted.
  if (!href) return <span className="btn btn-ghost" aria-disabled="true">Link unavailable</span>;
  return (
    <a className="btn btn-primary" href={href} target="_blank" rel="noopener noreferrer">
      View at {platformName(offer.platform)}
    </a>
  );
}

export default function Product() {
  const { id } = useParams();
  const product = useAsync((signal) => getListing(id, { signal }), [id]);

  if (product.status === "loading") {
    return (
      <div className="container product" aria-busy="true">
        <Skeleton height={28} width="60%" />
        <Skeleton height={220} />
      </div>
    );
  }

  if (product.status === "error") {
    return (
      <div className="container product">
        <ErrorState error={product.error} onRetry={product.reload} />
        <p><Link to="/">Back to the home page</Link></p>
      </div>
    );
  }

  const { listing, offers } = product.data;
  const summary = summarizeOffers(offers);
  const verdict = recommendationOf(listing);
  const flags = offerFlags(listing);

  return (
    <div className="container product">
      <p className="small"><Link to="/">Home</Link> / Product</p>

      <div className="product__top card">
        <ProductImage src={listing.imageUrl} alt={listing.title} height={240} />
        <div className="product__summary">
          <h1 className="product__title">{listing.title}</h1>
          <p className="price product__price">{formatPrice(listing.price)}</p>
          <p className="muted small">
            at {platformName(listing.platform)}
            {listing.lastScrapedAt ? ` · updated ${timeAgo(listing.lastScrapedAt)}` : ""}
          </p>
          <div className="product__badges">
            <VerdictBadge tone={verdict.tone} label={verdict.label} title={listing.recommendation?.reason} />
            {flags.map((flag) => (
              <VerdictBadge key={flag.id} tone={flag.tone} label={flag.label} title={flag.reason} />
            ))}
          </div>
          <StoreButton offer={listing} />
        </div>
      </div>

      <section aria-labelledby="offers-heading" className="product__offers">
        <h2 id="offers-heading">
          {offers.length} {offers.length === 1 ? "offer" : "offers"} from {summary.platformCount} {summary.platformCount === 1 ? "store" : "stores"}
        </h2>
        <div className="card product__table-wrap">
          <table className="product__table">
            <thead>
              <tr><th scope="col">Store</th><th scope="col" className="num">Price</th><th scope="col">Updated</th><th scope="col"><span className="visually-hidden">Link</span></th></tr>
            </thead>
            <tbody>
              {[...offers].sort((a, b) => a.price - b.price).map((offer) => (
                <tr key={offer._id} aria-current={offer._id === listing._id ? "true" : undefined}>
                  <td>{platformName(offer.platform)}{offer._id === listing._id ? <span className="small muted"> (this one)</span> : null}</td>
                  <td className="num price">{formatPrice(offer.price)}</td>
                  <td className="muted small">{offer.lastScrapedAt ? timeAgo(offer.lastScrapedAt) : ""}</td>
                  <td>
                    {offerLink(offer)
                      ? <a href={offerLink(offer)} target="_blank" rel="noopener noreferrer">View deal</a>
                      : <span className="muted small">Unavailable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
