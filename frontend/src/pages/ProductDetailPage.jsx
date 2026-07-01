import { useParams, useNavigate } from "react-router-dom";
import { DUMMY_PRODUCTS } from "../data/dummyProducts";

function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const product = DUMMY_PRODUCTS.find((p) => p._id === id);

  if (!product) {
    return (
      <div className="detail-not-found">
        <h2>Product not found</h2>
        <button className="back-btn" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        &#8592; Back to Results
      </button>

      <div className="detail-card">
        <div className="detail-left">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="detail-image"
          />
          {product.isBestDeal && (
            <div className="detail-best-badge">Best Deal</div>
          )}
        </div>

        <div className="detail-right">
          <div className="detail-platform">{product.platform}</div>
          <h1 className="detail-title">{product.title}</h1>

          <div className="detail-tags">
            {(product.tags || []).map((tag) => (
              <span key={tag} className="product-tag">{tag}</span>
            ))}
          </div>

          <p className="detail-description">{product.description}</p>

          <div className="detail-price-row">
            <div className="detail-price">
              PKR {product.price.toLocaleString()}
            </div>
            {product.originalPrice && product.originalPrice > product.price && (
              <div className="detail-original-price">
                PKR {product.originalPrice.toLocaleString()}
              </div>
            )}
            {product.discountPercent > 0 && (
              <div className="detail-discount">
                {product.discountPercent}% OFF
              </div>
            )}
          </div>

          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="detail-meta-label">Rating</span>
              <span className="detail-meta-value">
                &#9733; {product.rating}/5 ({product.reviewCount} reviews)
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Seller</span>
              <span className="detail-meta-value">{product.sellerName}</span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Delivery</span>
              <span className="detail-meta-value">
                {product.deliveryFee === 0 ? "Free Delivery" : `PKR ${product.deliveryFee}`}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Availability</span>
              <span className={product.availability === "In Stock" ? "in-stock detail-meta-value" : "low-stock detail-meta-value"}>
                &#9679; {product.availability}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Last Updated</span>
              <span className="detail-meta-value">
                {new Date(product.lastScrapedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {product.isSuspicious && (
            <div className="suspicious-badge" style={{ marginBottom: "16px" }}>
              Warning: Suspicious discount detected on this product
            </div>
          )}

          <button
            className="detail-view-btn"
            onClick={() => window.open(product.productUrl, "_blank")}
          >
            Visit {product.platform} to Buy
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailPage;