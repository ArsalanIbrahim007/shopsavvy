import { useNavigate } from "react-router-dom";

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
                  <img
                    src={product.platformLogo}
                    alt={product.platform}
                    className="store-logo"
                  />
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
                  {product.originalPrice && (
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
                  &#9733; {product.rating}/5
                  <span className="review-count">
                    ({product.reviewCount} reviews)
                  </span>
                </div>
              </td>
              <td>
                <div className="availability-cell">
                  <span className={product.availability === "In Stock" ? "in-stock" : "low-stock"}>
                    &#9679; {product.availability}
                  </span>
                  <span className="updated-date">
                    Updated: {new Date(product.lastScrapedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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