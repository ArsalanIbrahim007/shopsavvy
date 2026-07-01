function ProductHeader({ products }) {
  if (!products || products.length === 0) return null;

  const lowestPrice = Math.min(...products.map((p) => p.price));
  const highestPrice = Math.max(...products.map((p) => p.price));
  const savings = highestPrice - lowestPrice;
  const bestDealProduct = products.find((p) => p.isBestDeal) || products[0];
  const allTags = [...new Set(products.flatMap((p) => p.tags || []))];

  return (
    <div className="product-header">
      <div className="product-header-left">
        <img
          src={bestDealProduct.imageUrl}
          alt={bestDealProduct.title}
          className="product-header-image"
        />
      </div>
      <div className="product-header-middle">
        <h2 className="product-header-title">{bestDealProduct.normalizedTitle || bestDealProduct.title}</h2>
        <div className="product-header-tags">
          {allTags.map((tag) => (
            <span key={tag} className="product-tag">{tag}</span>
          ))}
        </div>
        <p className="product-header-desc">{bestDealProduct.description}</p>
      </div>
      <div className="product-header-right">
        <div className="best-deal-available-badge">Best Deal Available</div>
        <div className="savings-label">You can save up to</div>
        <div className="savings-amount">PKR {savings.toLocaleString()}</div>
        <div className="savings-sub">compared to highest price</div>
      </div>
    </div>
  );
}

export default ProductHeader;