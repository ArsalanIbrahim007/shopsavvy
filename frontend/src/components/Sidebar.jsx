import { useMemo } from "react";

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
    unknown: "Not Specified",
  }[status] || status;
}

const FACETS_BY_CATEGORY = {
  smartphone: ["storage", "colour", "condition", "pta"],
  tablet: ["storage", "colour", "condition", "pta"],
  laptop: ["storage", "ram", "screen", "colour", "condition"],
  tv: ["screen", "resolution", "condition"],
  monitor: ["screen", "resolution", "condition"],
  smartwatch: ["colour", "condition"],
  headphones: ["colour", "condition"],
  appliance: ["condition"],
  accessory: ["colour", "condition"],
  other: ["colour", "condition"],
};

const RESOLUTION_ORDER = {
  "8K": 0,
  "4K": 1,
  QHD: 2,
  FHD: 3,
  HD: 4,
};

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
  selectedStorage = [],
  setSelectedStorage = () => {},
  selectedColours = [],
  setSelectedColours = () => {},
  selectedCondition = [],
  setSelectedCondition = () => {},
  selectedPta = [],
setSelectedPta = () => {},
selectedScreen = [],
setSelectedScreen = () => {},
selectedResolution = [],
setSelectedResolution = () => {},
}) {
  const facets = useMemo(() => {
    const collect = (key) => {
      const counts = new Map();
      products.forEach((product) => {
        const value = product[key];
        if (value === null || value === undefined || value === "") return;
        counts.set(value, (counts.get(value) || 0) + 1);
      });
      return [...counts.entries()].map(([value, count]) => ({ value, count }));
    };

    return {
  storage: collect("storageGb").sort((a, b) => a.value - b.value),
  screen: collect("screenInches").sort((a, b) => a.value - b.value),
  resolution: collect("resolution").sort(
    (a, b) =>
      (RESOLUTION_ORDER[a.value] ?? 99) -
      (RESOLUTION_ORDER[b.value] ?? 99)
  ),
  colour: collect("colour").sort((a, b) => b.count - a.count),
  condition: collect("condition").sort((a, b) => b.count - a.count),
  pta: collect("ptaStatus")
  .filter((option) => option.value !== "unknown")
  .sort((a, b) => b.count - a.count),
};
  }, [products]);

const applicableFacets = useMemo(() => {
  const categories = new Set(
    products.map((product) => product.productCategory || "other")
  );

  const allowed = new Set();

  categories.forEach((category) => {
    (FACETS_BY_CATEGORY[category] || []).forEach((facet) => {
      allowed.add(facet);
    });
  });

  return allowed;
}, [products]);

  function toggleSelection(value, selected, setSelected) {
    setSelected(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  }

  function renderFacet(title, options, selected, setSelected, formatLabel = (value) => value) {
    if (options.length < 2) return null;

    return (
      <div className="sidebar-section">
        <div className="sidebar-heading">{title}</div>
        <div className="sidebar-divider" />
        <div className="facet-list">
          {options.map(({ value, count }) => (
            <label className="facet-option" key={value}>
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggleSelection(value, selected, setSelected)}
              />
              <span className="facet-check" aria-hidden="true" />
              <span className="facet-label">{formatLabel(value)}</span>
              <span className="facet-count">({count})</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  function handleReset() {
  setSelectedStorage([]);
  setSelectedColours([]);
  setSelectedCondition([]);
  setSelectedPta([]);
  setSelectedScreen([]);
  setSelectedResolution([]);
  onReset();
}
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

      {applicableFacets.has("storage") &&
  renderFacet(
    "Storage",
    facets.storage,
    selectedStorage,
    setSelectedStorage,
    formatCapacity
  )}

{applicableFacets.has("screen") &&
  renderFacet(
    "Screen Size",
    facets.screen,
    selectedScreen,
    setSelectedScreen,
    (value) => `${value}"`
  )}

{applicableFacets.has("resolution") &&
  renderFacet(
    "Resolution",
    facets.resolution,
    selectedResolution,
    setSelectedResolution
  )}

{applicableFacets.has("colour") &&
  renderFacet(
    "Colour",
    facets.colour,
    selectedColours,
    setSelectedColours
  )}

{applicableFacets.has("condition") &&
  renderFacet(
    "Condition",
    facets.condition,
    selectedCondition,
    setSelectedCondition,
    formatCondition
  )}

{applicableFacets.has("pta") &&
  renderFacet(
    "PTA Status",
    facets.pta,
    selectedPta,
    setSelectedPta,
    formatPta
  )}

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
            <span>Best Deal Score</span>
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

      <button className="reset-btn" onClick={handleReset}>
        &#8635; Reset Filters
      </button>
    </div>
  );
}

export default Sidebar;