function ProductCard({ product }) {
  const handleClick = () => {
    window.open(product.productUrl, "_blank");
  };

  return (
    <div className="product-card">
      {product.isBestDeal === true && (
        <div className="best-deal-badge">Best Deal</div>
      )}
      <div className="product-card-inner">
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
        <div className="product-details">
          <div className="product-platform">{product.platform}</div>
          <div className="product-title">{product.title}</div>
          {product.rating > 0 && (
            <div className="product-rating">
              Rating: {product.rating}/5 ({product.reviewCount} reviews)
            </div>
          )}
          {product.sellerName && (
            <div className="product-seller">Sold by: {product.sellerName}</div>
          )}
          {product.lastScrapedAt && (
            <div className="product-freshness">
              Updated: {new Date(product.lastScrapedAt).toLocaleDateString()}
            </div>
          )}
          {product.isSuspicious === true && (
            <div className="suspicious-badge">Suspicious Discount</div>
          )}
        </div>
        <div className="product-price-section">
          <div className="product-price">
            PKR {product.price.toLocaleString()}
          </div>
          {product.originalPrice && product.originalPrice > product.price && (
            <div className="product-original-price">
              PKR {product.originalPrice.toLocaleString()}
            </div>
          )}
          {product.discountPercent > 0 && (
            <div className="product-discount">
              {product.discountPercent}% OFF
            </div>
          )}
          <button className="product-link" onClick={handleClick}>
            View on {product.platform}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;