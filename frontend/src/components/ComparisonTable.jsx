import { useNavigate } from "react-router-dom";

const PLATFORM_LOGOS = {
  priceoye: "https://priceoye.pk/favicon.ico",
  PriceOye: "https://priceoye.pk/favicon.ico",
  shophive: "https://shophive.com/favicon.ico",
  Shophive: "https://shophive.com/favicon.ico",
  mega: "https://mega.pk/favicon.ico",
  "Mega.pk": "https://mega.pk/favicon.ico",
  homeshopping: "https://homeshopping.pk/favicon.ico",
  HomeShopping: "https://homeshopping.pk/favicon.ico",
  telemart: "https://telemart.pk/favicon.ico",
  Telemart: "https://telemart.pk/favicon.ico",
  ishopping: "https://ishopping.pk/favicon.ico",
  iShopping: "https://ishopping.pk/favicon.ico",
  symbios: "https://symbios.pk/favicon.ico",
  Symbios: "https://symbios.pk/favicon.ico",
};

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

function PlatformLogo({ platform }) {
  const logoUrl = PLATFORM_LOGOS[platform];
  const color = PLATFORM_COLORS[platform] || "#1a73e8";
  const initial = platform ? platform.charAt(0).toUpperCase() : "S";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={platform}
        className="store-logo"
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "flex";
        }}
      />
    );
  }

  return (
    <div
      className="store-logo-fallback"
      style={{ background: color }}
    >
      {initial}
    </div>
  );
}

function ComparisonTable({ products }) {
  const navigate = useNavigate();

  if (!products || products.length === 0) return null;

  const sorted = [...products].sort((a, b) => a.price - b.price);

  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Rating</th>
            <th>Availability</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((product) => (
            <tr
              key={product._id}
              className={product.isBestDeal ? "best-deal-row" : ""}
            >
              <td>
                <div className="store-cell">
                  {product.isBestDeal && (
                    <span className="table-best-badge">Best Deal</span>
                  )}
                  <div className="store-logo-wrapper">
                    <PlatformLogo platform={product.platform} />
                    <div
                      className="store-logo-fallback"
                      style={{
                        display: "none",
                        background: PLATFORM_COLORS[product.platform] || "#1a73e8",
                      }}
                    >
                      {product.platform ? product.platform.charAt(0).toUpperCase() : "S"}
                    </div>
                  </div>
                  <span className="store-name">{product.platform}</span>
                </div>
              </td>
              <td>
                <div className="price-cell">
                  PKR {product.price.toLocaleString()}
                </div>
              </td>
              <td>
                <div className="discount-cell">
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="table-original">
                      PKR {product.originalPrice.toLocaleString()}
                    </span>
                  )}
                  {product.discountPercent > 0 && (
                    <span className="table-discount">
                      {product.discountPercent}% OFF
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div className="rating-cell">
                  {product.rating > 0 ? (
                    <>
                      &#9733; {product.rating}/5
                      <span className="review-count">
                        ({product.reviewCount || 0} reviews)
                      </span>
                    </>
                  ) : (
                    <span className="no-rating">No rating</span>
                  )}
                </div>
              </td>
              <td>
                <div className="availability-cell">
                  <span className={product.availability === "In Stock" || product.inStock ? "in-stock" : "low-stock"}>
                    &#9679; {product.availability || (product.inStock ? "In Stock" : "Out of Stock")}
                  </span>
                  <span className="updated-date">
                    Updated: {new Date(product.lastScrapedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </td>
              <td>
                <button
                  className="view-deal-btn"
                  onClick={() => navigate(`/product/${product._id}`)}
                >
                  View Deal
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        Prices are subject to change. Please verify on the store website before purchasing.
      </div>
    </div>
  );
}

export default ComparisonTable;