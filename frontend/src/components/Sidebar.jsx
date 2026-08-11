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
  selectedCategory = "all",
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
  /**
   * Filters are shown for one category at a time. Taking the union across
   * every category present meant a TV search could offer a PTA filter because
   * some phones happened to match the query. A selected category chip wins;
   * otherwise the most common category in the results is used.
   */
  const activeCategory = useMemo(() => {
    if (selectedCategory && selectedCategory !== "all") {
      return selectedCategory;
    }

    const counts = new Map();

    products.forEach((product) => {
      const category = product.productCategory || "other";
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    let dominant = "other";
    let highest = 0;

    counts.forEach((count, category) => {
      if (count > highest) {
        highest = count;
        dominant = category;
      }
    });

    return dominant;
  }, [products, selectedCategory]);

  const facets = useMemo(() => {
    // Options come from the active category only, so a laptop search never
    // offers an attribute value belonging to a phone in the same result set.
    const scoped = products.filter(
      (product) =>
        (product.productCategory || "other") === activeCategory
    );

    const collect = (key) => {
      const counts = new Map();

      scoped.forEach((product) => {
        const value = product[key];

        if (
          value === null ||
          value === undefined ||
          value === ""
        ) {
          return;
        }

        counts.set(value, (counts.get(value) || 0) + 1);
      });

      return [...counts.entries()].map(([value, count]) => ({
        value,
        count,
      }));
    };

    return {
      storage: collect("storageGb").sort(
        (a, b) => a.value - b.value
      ),

      screen: collect("screenInches").sort(
        (a, b) => a.value - b.value
      ),

      resolution: collect("resolution").sort(
        (a, b) =>
          (RESOLUTION_ORDER[a.value] ?? 99) -
          (RESOLUTION_ORDER[b.value] ?? 99)
      ),

      colour: collect("colour").sort(
        (a, b) => b.count - a.count
      ),

      condition: collect("condition").sort(
        (a, b) => b.count - a.count
      ),

      // Most stores do not state approval status. A filter for "we don't
      // know" is not actionable, so only the real values are offered.
      pta: collect("ptaStatus")
        .filter((option) => option.value !== "unknown")
        .sort((a, b) => b.count - a.count),
    };
  }, [products, activeCategory]);

  const applicableFacets = useMemo(
    () =>
      new Set(
        FACETS_BY_CATEGORY[activeCategory] ||
          ["colour", "condition"]
      ),
    [activeCategory]
  );

  function toggleSelection(value, selected, setSelected) {
    setSelected(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  }

  function renderFacet(
    title,
    options,
    selected,
    setSelected,
    formatLabel = (value) => value
  ) {
    // A facet containing only one option provides no useful choice.
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
                onChange={() =>
                  toggleSelection(
                    value,
                    selected,
                    setSelected
                  )
                }
              />

              <span
                className="facet-check"
                aria-hidden="true"
              />

              <span className="facet-label">
                {formatLabel(value)}
              </span>

              <span className="facet-count">
                ({count})
              </span>
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

      setSelectedPlatforms(
        selectedPlatforms.filter(
          (selected) => selected !== platform
        )
      );
    } else {
      setSelectedPlatforms([
        ...selectedPlatforms,
        platform,
      ]);
    }
  }

  function getCount(platform) {
    return products.filter(
      (product) => product.platform === platform
    ).length;
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">
          Platform
        </div>

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
              onClick={() =>
                togglePlatform(platform)
              }
            >
              <span className="platform-check">
                {selectedPlatforms.includes(platform)
                  ? "✓"
                  : ""}
              </span>

              <span className="platform-btn-name">
                {platform}
              </span>

              <span className="platform-count">
                {getCount(platform)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">
          Price Range
        </div>

        <div className="sidebar-divider" />

        <div className="price-labels">
          <span>
            PKR {priceRange[0].toLocaleString()}
          </span>

          <span>
            PKR {priceRange[1].toLocaleString()}
          </span>
        </div>

        <div className="slider-wrapper">
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[0]}
            onChange={(event) => {
              const value = Number(
                event.target.value
              );

              if (value < priceRange[1]) {
                setPriceRange([
                  value,
                  priceRange[1],
                ]);
              }
            }}
            className="price-slider"
          />

          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[1]}
            onChange={(event) => {
              const value = Number(
                event.target.value
              );

              if (value > priceRange[0]) {
                setPriceRange([
                  priceRange[0],
                  value,
                ]);
              }
            }}
            className="price-slider"
          />
        </div>

        <div className="price-minmax">
          <span>
            Min: PKR {minPrice.toLocaleString()}
          </span>

          <span>
            Max: PKR {maxPrice.toLocaleString()}
          </span>
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
        <div className="sidebar-heading">
          Sort By
        </div>

        <div className="sidebar-divider" />

        <div className="sort-options">
          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={
                !showBestDeal && !showTopRated
              }
              onChange={() => {
                setShowBestDeal(false);
                setShowTopRated(false);
              }}
              className="sort-radio"
            />

            <span>Best Deal</span>

            <span className="recommended-tag">
              Recommended
            </span>
          </label>

          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={
                !showBestDeal && !showTopRated
              }
              onChange={() => {
                setShowBestDeal(false);
                setShowTopRated(false);
              }}
              className="sort-radio"
            />

            <span>Lowest Price</span>
          </label>

          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={showTopRated}
              onChange={() => {
                setShowTopRated(true);
                setShowBestDeal(false);
              }}
              className="sort-radio"
            />

            <span>Best Deal Score</span>
          </label>

          <label className="sort-radio-label">
            <input
              type="radio"
              name="sort"
              checked={showBestDeal}
              onChange={() => {
                setShowBestDeal(true);
                setShowTopRated(false);
              }}
              className="sort-radio"
            />

            <span>Highest Discount</span>
          </label>
        </div>
      </div>

      <button
        className="reset-btn"
        onClick={handleReset}
      >
        &#8635; Reset Filters
      </button>
    </div>
  );
}

export default Sidebar;