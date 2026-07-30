function SummaryCards({ products }) {
  if (!products || products.length === 0) return null;

  const platforms = [...new Set(products.map((p) => p.platform))];
  const lowestPriceProduct = products.reduce((a, b) => a.price < b.price ? a : b);
  const averagePrice = Math.round(products.reduce((sum, p) => sum + p.price, 0) / products.length);
  const bestDealProduct = products.find((p) => p.isBestDeal) || lowestPriceProduct;

  const cards = [
    {
      id: "platforms",
      icon: "&#128722;",
      iconBg: "#e8f0fe",
      iconColor: "#1a73e8",
      label: "Platforms Compared",
      value: platforms.length,
      sub: platforms.join(", "),
    },
    {
      id: "lowest",
      icon: "&#127991;",
      iconBg: "#e8f5e9",
      iconColor: "#43a047",
      label: "Lowest Price",
      value: `PKR ${lowestPriceProduct.price.toLocaleString()}`,
      sub: lowestPriceProduct.platform,
    },
    {
      id: "average",
      icon: "&#128200;",
      iconBg: "#f3e5f5",
      iconColor: "#8e24aa",
      label: "Average Price",
      value: `PKR ${averagePrice.toLocaleString()}`,
      sub: `Across ${products.length} offers`,
    },
    {
      id: "bestdeal",
      icon: "&#127942;",
      iconBg: "#fff8e1",
      iconColor: "#f9a825",
      label: "Best Deal",
      value: bestDealProduct.platform,
      sub: `PKR ${bestDealProduct.price.toLocaleString()}`,
    },
  ];

  return (
    <div className="summary-cards">
      {cards.map((card) => (
        <div className="summary-card" key={card.id}>
          <div
            className="summary-icon"
            style={{ background: card.iconBg, color: card.iconColor }}
            dangerouslySetInnerHTML={{ __html: card.icon }}
          />
          <div className="summary-info">
            <div className="summary-label">{card.label}</div>
            <div className="summary-value">{card.value}</div>
            <div className="summary-sub">{card.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default SummaryCards;