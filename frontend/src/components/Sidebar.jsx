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
}) {
  function togglePlatform(platform) {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length === 1) return;
      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  }

  return (
    <div className="sidebar">

      <div className="sidebar-section">
        <div className="sidebar-heading">Filter by Platform</div>
        <div className="sidebar-divider" />
        <div className="platform-list">
          {allPlatforms.map((platform) => (
            <button
              key={platform}
              className={
                selectedPlatforms.includes(platform)
                  ? "platform-btn active"
                  : "platform-btn"
              }
              onClick={() => togglePlatform(platform)}
            >
              <span className="platform-check">
                {selectedPlatforms.includes(platform) ? "✓" : ""}
              </span>
              {platform}
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
              if (val < priceRange[1]) {
                setPriceRange([val, priceRange[1]]);
              }
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
              if (val > priceRange[0]) {
                setPriceRange([priceRange[0], val]);
              }
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
        <div className="sort-buttons">
          <button
            className={showBestDeal ? "sort-btn active" : "sort-btn"}
            onClick={() => setShowBestDeal(!showBestDeal)}
          >
            Best Deal
          </button>
          <button
            className={showTopRated ? "sort-btn active" : "sort-btn"}
            onClick={() => setShowTopRated(!showTopRated)}
          >
            Top Rated
          </button>
        </div>
      </div>

      <button className="reset-btn" onClick={onReset}>
        Reset Filters
      </button>

    </div>
  );
}

export default Sidebar;