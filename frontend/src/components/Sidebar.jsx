function Sidebar({
  allPlatforms,
  selectedPlatforms,
  setSelectedPlatforms,
  minPrice,
  maxPrice,
  priceRange,
  setPriceRange,
  showBestDeal,
  setShowBestDeal,
  showTopRated,
  setShowTopRated,
  onReset,
  products,
}) {
  function togglePlatform(platform) {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length === 1) return;
      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  }

  function getCount(platform) {
    return products.filter((p) => p.platform === platform).length;
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Platform</div>
        <div className="sidebar-divider" />
        <div className="platform-list">
          {allPlatforms.map((platform) => (
            <button
              key={platform}
              className={selectedPlatforms.includes(platform) ? "platform-btn active" : "platform-btn"}
              onClick={() => togglePlatform(platform)}
            >
              <span className="platform-check">
                {selectedPlatforms.includes(platform) ? "✓" : ""}
              </span>
              <span className="platform-btn-name">{platform}</span>
              <span className="platform-count">{getCount(platform)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Price Range</div>
        <div className="sidebar-divider" />
        <div className="price-labels">
          <span>PKR {priceRange[0].toLocaleString()}</span>
          <span>PKR {priceRange[1].toLocaleString()}</span>
        </div>
        <div className="slider-wrapper">
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[0]}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val < priceRange[1]) setPriceRange([val, priceRange[1]]);
            }}
            className="price-slider"
          />
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[1]}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val > priceRange[0]) setPriceRange([priceRange[0], val]);
            }}
            className="price-slider"
          />
        </div>
        <div className="price-minmax">
          <span>Min: PKR {minPrice.toLocaleString()}</span>
          <span>Max: PKR {maxPrice.toLocaleString()}</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Sort By</div>
        <div className="sidebar-divider" />
        <div className="sort-options">
          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={!showBestDeal && !showTopRated}
              onChange={() => { setShowBestDeal(false); setShowTopRated(false); }}
              className="sort-radio"
            />
            <span>Best Deal</span>
            <span className="recommended-tag">Recommended</span>
          </label>
          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={!showBestDeal && !showTopRated}
              onChange={() => { setShowBestDeal(false); setShowTopRated(false); }}
              className="sort-radio"
            />
            <span>Lowest Price</span>
          </label>
          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={showTopRated}
              onChange={() => { setShowTopRated(true); setShowBestDeal(false); }}
              className="sort-radio"
            />
            <span>Top Rated</span>
          </label>
          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={showBestDeal}
              onChange={() => { setShowBestDeal(true); setShowTopRated(false); }}
              className="sort-radio"
            />
            <span>Highest Discount</span>
          </label>
        </div>
      </div>

      <button className="reset-btn" onClick={onReset}>
        &#8635; Reset Filters
      </button>
    </div>
  );
}

export default Sidebar;