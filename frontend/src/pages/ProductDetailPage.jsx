import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`http://localhost:5000/api/listings/${id}`);
        const data = await response.json();

        if (data.success && data.listing) {
  setProduct(data.listing);
} else if (data.success && data.data) {
  setProduct(data.data);
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

  if (error || !product) {
    return (
      <div className="detail-not-found">
        <h2>Product not found</h2>
        <button className="back-btn" onClick={() => navigate(-1)}>
          Go Back
        </button>
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
            src={product.imageUrl || product.images?.[0] || "https://placehold.co/300x300/f5f7fb/333?text=No+Image"}
            onError={(e) => { e.target.src = "https://placehold.co/300x300/f5f7fb/333?text=No+Image"; }}
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

          {product.tags && product.tags.length > 0 && (
            <div className="detail-tags">
              {product.tags.map((tag) => (
                <span key={tag} className="product-tag">{tag}</span>
              ))}
            </div>
          )}

          {product.description && (
            <p className="detail-description">{product.description}</p>
          )}

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
            {product.rating > 0 && (
              <div className="detail-meta-item">
                <span className="detail-meta-label">Rating</span>
                <span className="detail-meta-value">
                  &#9733; {product.rating}/5 ({product.reviewCount || 0} reviews)
                </span>
              </div>
            )}
            {product.sellerName && (
              <div className="detail-meta-item">
                <span className="detail-meta-label">Seller</span>
                <span className="detail-meta-value">{product.sellerName}</span>
              </div>
            )}
            <div className="detail-meta-item">
              <span className="detail-meta-label">Delivery</span>
              <span className="detail-meta-value">
                {product.deliveryFee === 0 ? "Free Delivery" : product.deliveryFee ? `PKR ${product.deliveryFee}` : "Check website"}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Availability</span>
              <span className={
                product.availability === "In Stock" || product.inStock
                  ? "in-stock detail-meta-value"
                  : "low-stock detail-meta-value"
              }>
                &#9679; {product.availability || (product.inStock ? "In Stock" : "Out of Stock")}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Category</span>
              <span className="detail-meta-value">{product.category || "Electronics"}</span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-meta-label">Last Updated</span>
              <span className="detail-meta-value">
                {new Date(product.lastScrapedAt || product.updatedAt).toLocaleDateString()}
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
            onClick={() => window.open(product.productUrl || product.sourceUrl, "_blank")}
          >
            Visit {product.platform} to Buy
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailPage;