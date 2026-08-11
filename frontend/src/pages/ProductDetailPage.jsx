import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

const PLATFORM_COLORS = {
  priceoye: "#e8401c",
  PriceOye: "#e8401c",
  shophive: "#0066cc",
  Shophive: "#0066cc",
  mega: "#ff6600",
  "Mega.pk": "#ff6600",
  homeshopping: "#cc0000",
  HomeShopping: "#cc0000",
  telemart: "#2196F3",
  Telemart: "#2196F3",
  ishopping: "#4CAF50",
  iShopping: "#4CAF50",
  symbios: "#9C27B0",
  Symbios: "#9C27B0",
};

const PLATFORM_LOGOS = {
  priceoye: "https://priceoye.pk/favicon.ico",
  PriceOye: "https://priceoye.pk/favicon.ico",
  shophive: "https://shophive.com/favicon.ico",
  Shophive: "https://shophive.com/favicon.ico",
  mega: "https://mega.pk/favicon.ico",
  "Mega.pk": "https://mega.pk/favicon.ico",
  homeshopping: "https://homeshopping.pk/favicon.ico",
  telemart: "https://telemart.pk/favicon.ico",
};

function PlatformBadge({ platform }) {
  const color = PLATFORM_COLORS[platform] || "#1a73e8";
  const logo = PLATFORM_LOGOS[platform];
  const initial = platform ? platform.charAt(0).toUpperCase() : "S";

  return (
    <div className="detail-platform-badge" style={{ background: color }}>
      {logo ? (
        <img
          src={logo}
          alt={platform}
          className="detail-badge-logo"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "inline";
          }}
        />
      ) : null}
      <span style={{ display: logo ? "none" : "inline" }}>{initial}</span>
    </div>
  );
}

function formatCapacity(gb) {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

function formatCondition(condition) {
  return {
    new: "New",
    used: "Used",
    refurbished: "Refurbished",
    open_box: "Open Box",
  }[condition] || condition;
}

function formatPta(status) {
  return {
    pta_approved: "PTA Approved",
    non_pta: "Non-PTA",
  }[status] || "Not specified";
}

function formatCategory(category) {
  return {
    smartphone: "Smartphone",
    laptop: "Laptop",
    tv: "Television",
    tablet: "Tablet",
    smartwatch: "Smartwatch",
    headphones: "Headphones",
    monitor: "Monitor",
    appliance: "Home Appliance",
    accessory: "Accessory",
  }[category] || category;
}

function Specifications({ listing }) {
  const specs = [];

  if (listing.brand) specs.push(["Brand", listing.brand]);
  if (listing.productCategory && listing.productCategory !== "other") {
    specs.push(["Category", formatCategory(listing.productCategory)]);
  }
  if (listing.storageGb) specs.push(["Storage", formatCapacity(listing.storageGb)]);
  if (listing.ramGb) specs.push(["Memory", `${listing.ramGb} GB RAM`]);
  if (listing.screenInches) specs.push(["Screen Size", `${listing.screenInches} inches`]);
  if (listing.colour) specs.push(["Colour", listing.colour]);
  if (listing.condition) specs.push(["Condition", formatCondition(listing.condition)]);
  if (listing.ptaStatus && listing.ptaStatus !== "unknown") {
    specs.push(["Network Approval", formatPta(listing.ptaStatus)]);
  }

  if (specs.length === 0) return null;

  return (
    <div className="detail-specs">
      <h3 className="detail-specs-title">Specifications</h3>
      <table className="detail-specs-table">
        <tbody>
          {specs.map(([label, value]) => (
            <tr key={label}>
              <td className="spec-label">{label}</td>
              <td className="spec-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="detail-specs-note">
        Specifications are derived from the product title published by the store.
      </p>
    </div>
  );
}

function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [offers, setOffers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`http://localhost:5000/api/listings/${id}`);
        const data = await response.json();

        if (data.success && data.listing) {
          setListing(data.listing);
          setOffers(data.offers || []);
          setSummary(data.summary || null);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Failed to fetch product:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p className="loading-text">Loading product details...</p>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="detail-not-found">
        <h2>Product not found</h2>
        <button className="back-btn" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </div>
    );
  }

  const savings = summary?.highestPrice && summary?.lowestPrice
    ? summary.highestPrice - summary.lowestPrice
    : null;

  return (
    <div className="detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        &#8592; Back to Results
      </button>

      <div className="detail-hero">
        <div className="detail-hero-left">
          <img
            src={listing.imageUrl}
            alt={listing.title}
            referrerPolicy="no-referrer"
            className="detail-image"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "/icons.svg"; // fallback placeholder
            }}
          />
        </div>

        <div className="detail-hero-middle">
          <div className="detail-platform">{listing.platform}</div>
          <h1 className="detail-title">{listing.title}</h1>

          {listing.productCategory && listing.productCategory !== "other" && (
            <div className="detail-category">
              Category: {formatCategory(listing.productCategory)}
            </div>
          )}

          <div className="detail-price-row">
            <div className="detail-price">
              PKR {listing.price.toLocaleString()}
            </div>
            {listing.originalPrice && listing.originalPrice > listing.price && (
              <div className="detail-original-price">
                PKR {listing.originalPrice.toLocaleString()}
              </div>
            )}
            {listing.discountPercent > 0 && (
              <div className="detail-discount">
                {listing.discountPercent}% OFF
              </div>
            )}
          </div>

          <Specifications listing={listing} />

          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="detail-meta-label">Availability</span>
              <span className={listing.inStock ? "in-stock detail-meta-value" : "low-stock detail-meta-value"}>
                &#9679; {listing.availability || (listing.inStock ? "In Stock" : "Out of Stock")}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Last Updated</span>
              <span className="detail-meta-value">
                {new Date(listing.lastScrapedAt || listing.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <button
            className="detail-view-btn"
            disabled={!(listing.productUrl || listing.sourceUrl)}
            onClick={() => {
              const url = listing.productUrl || listing.sourceUrl;
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            {listing.productUrl || listing.sourceUrl
              ? `Visit ${listing.platform} to Buy`
              : "Store link unavailable"}
          </button>
        </div>

        {summary && (
          <div className="detail-hero-right">
            <div className="detail-summary-card">
              <div className="detail-summary-item">
                <div className="detail-summary-label">Platforms Compared</div>
                <div className="detail-summary-value">{summary.platforms}</div>
              </div>
              <div className="detail-summary-item">
                <div className="detail-summary-label">Lowest Price</div>
                <div className="detail-summary-value green">
                  PKR {summary.lowestPrice?.toLocaleString()}
                </div>
              </div>
              <div className="detail-summary-item">
                <div className="detail-summary-label">Highest Price</div>
                <div className="detail-summary-value">
                  PKR {summary.highestPrice?.toLocaleString()}
                </div>
              </div>
              {savings > 0 && (
                <div className="detail-summary-item">
                  <div className="detail-summary-label">You Can Save</div>
                  <div className="detail-summary-value green">
                    PKR {savings.toLocaleString()}
                  </div>
                </div>
              )}
              <div className="detail-summary-item">
                <div className="detail-summary-label">Best Deal</div>
                <div className="detail-summary-value blue">
                  {summary.bestDealPlatform}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {offers && offers.length > 1 && (
        <div className="detail-offers-section">
          <h2 className="detail-offers-title">
            All Offers for This Product
            <span className="detail-offers-count">{offers.length} offers</span>
          </h2>
          <div className="detail-offers-table-wrapper">
            <table className="detail-offers-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Price</th>
                  <th>Discount</th>
                  <th>Availability</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...offers]
                  .sort((a, b) => a.price - b.price)
                  .map((offer) => (
                    <tr
                      key={offer._id}
                      className={offer._id === listing._id ? "current-offer-row" : ""}
                    >
                      <td>
                        <div className="detail-store-cell">
                          <PlatformBadge platform={offer.platform} />
                          <span className="store-name">{offer.platform}</span>
                          {offer._id === listing._id && (
                            <span className="current-offer-tag">Viewing</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="detail-offer-price">
                          PKR {offer.price?.toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <div className="discount-cell">
                          {offer.originalPrice && offer.originalPrice > offer.price && (
                            <span className="table-original">
                              PKR {offer.originalPrice?.toLocaleString()}
                            </span>
                          )}
                          {offer.discountPercent > 0 && (
                            <span className="table-discount">
                              {offer.discountPercent}% OFF
                            </span>
                          )}
                          {!offer.originalPrice && !offer.discountPercent && (
                            <span style={{ color: "#bbb", fontSize: "12px" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={offer.inStock ? "in-stock" : "low-stock"}>
                          &#9679; {offer.availability || (offer.inStock ? "In Stock" : "Out of Stock")}
                        </span>
                      </td>
                      <td>
                        <span className="updated-date">
                          {new Date(offer.lastScrapedAt || offer.updatedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </td>
                      <td>
                        <button
                          className="view-deal-btn"
                          disabled={!(offer.productUrl || offer.sourceUrl)}
                          onClick={() => {
                            const url = offer.productUrl || offer.sourceUrl;
                            if (url) window.open(url, "_blank", "noopener");
                          }}
                        >
                          {offer.productUrl || offer.sourceUrl ? "View Deal" : "No link"}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetailPage;