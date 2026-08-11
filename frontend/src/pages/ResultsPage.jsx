import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { searchProducts } from "../api/api";
import Sidebar from "../components/Sidebar";
import SummaryCards from "../components/SummaryCards";
import ProductHeader from "../components/ProductHeader";
import ComparisonTable from "../components/ComparisonTable";

const CATEGORY_NAMES = {
  smartphone: "Smartphones",
  laptop: "Laptops",
  tablet: "Tablets",
  tv: "TVs",
  headphones: "Headphones",
  smartwatch: "Smartwatches",
  monitor: "Monitors",
  gaming_console: "Gaming Consoles",
  accessory: "Accessories",
  appliance: "Appliances",
  other: "Other",
};

function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q");

  const [products, setProducts] = useState([]);
  const [groupCount, setGroupCount] = useState(0);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const result = await searchProducts(query);
      setProducts(result.products);
      setGroupCount(result.groupCount);
      setGroups(result.groups || []);
      setBackendDown(result.error);
      setLoading(false);
    }
    if (query) fetchData();
  }, [query]);

  const allPlatforms = useMemo(
    () => [...new Set(products.map((p) => p.platform))],
    [products]
  );

  const allCategories = useMemo(
    () => [
      ...new Set(
        products
          .map((p) => p.productCategory)
          .filter(Boolean)
      ),
    ],
    [products]
  );

  const categoryCounts = useMemo(() => {
    const counts = {};

    products.forEach((product) => {
      const category = product.productCategory || "other";
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  }, [products]);

  const minPrice = useMemo(
    () => (products.length === 0 ? 0 : Math.min(...products.map((p) => p.price))),
    [products]
  );

  const maxPrice = useMemo(
    () => (products.length === 0 ? 100000 : Math.max(...products.map((p) => p.price))),
    [products]
  );

  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [showBestDeal, setShowBestDeal] = useState(false);
  const [showTopRated, setShowTopRated] = useState(false);

  useEffect(() => {
    if (allPlatforms.length > 0) {
      const urlPlatforms = searchParams.get("platforms");
      const urlMinPrice = searchParams.get("minPrice");
      const urlMaxPrice = searchParams.get("maxPrice");

      setSelectedPlatforms(urlPlatforms ? urlPlatforms.split(",") : allPlatforms);
      setPriceRange([
        urlMinPrice ? Number(urlMinPrice) : minPrice,
        urlMaxPrice ? Number(urlMaxPrice) : maxPrice,
      ]);
      setShowBestDeal(searchParams.get("bestDeal") === "true");
      setShowTopRated(searchParams.get("topRated") === "true");
    }
  }, [allPlatforms, minPrice, maxPrice]);

  function updateURL(platforms, price, bestDeal, topRated) {
    const params = { q: query };
    if (platforms.length !== allPlatforms.length) params.platforms = platforms.join(",");
    if (price[0] !== minPrice) params.minPrice = price[0];
    if (price[1] !== maxPrice) params.maxPrice = price[1];
    if (bestDeal) params.bestDeal = "true";
    if (topRated) params.topRated = "true";
    setSearchParams(params);
  }

  function handlePlatformChange(platforms) {
    setSelectedPlatforms(platforms);
    updateURL(platforms, priceRange, showBestDeal, showTopRated);
  }

  function handlePriceChange(price) {
    setPriceRange(price);
    updateURL(selectedPlatforms, price, showBestDeal, showTopRated);
  }

  function handleBestDeal(val) {
    setShowBestDeal(val);
    updateURL(selectedPlatforms, priceRange, val, showTopRated);
  }

  function handleTopRated(val) {
    setShowTopRated(val);
    updateURL(selectedPlatforms, priceRange, showBestDeal, val);
  }

  function handleReset() {
    setSelectedPlatforms(allPlatforms);
    setPriceRange([minPrice, maxPrice]);
    setShowBestDeal(false);
    setShowTopRated(false);
    setSearchParams({ q: query });
  }

  const filtered = useMemo(() => {
    let results = [...products];

    // Category filter
    if (selectedCategory !== "all") {
      results = results.filter(
        (p) => (p.productCategory || "other") === selectedCategory
      );
    }

    // Platform filter
    results = results.filter((p) =>
      selectedPlatforms.includes(p.platform)
    );

    // Price filter
    results = results.filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    );

    // Best deals
    if (showBestDeal) {
      results = results.filter((p) =>
        ["BUY_NOW", "GOOD_DEAL"].includes(p.recommendation?.action)
      );
    }

    // Top rated
    if (showTopRated) {
      results.sort(
        (a, b) => (b.dealScore || 0) - (a.dealScore || 0)
      );
    }

    return results;
  }, [
    products,
    selectedCategory,
    selectedPlatforms,
    priceRange,
    showBestDeal,
    showTopRated,
  ]);
/*
   * The backend has already decided which offers belong to the same product.
   * Rebuilding the groups from the filtered set keeps the sidebar filters
   * working while preserving that decision, so that a comparison is only ever
   * shown between offers of the same product.
   */
  const filteredGroups = useMemo(() => {
    const keep = new Set(filtered.map((p) => p._id));

    return groups
      .map((group) => ({
        ...group,
        offers: (group.offers || []).filter((o) => keep.has(o._id)),
      }))
      .filter((group) => group.offers.length > 0)
      .sort((a, b) => b.offers.length - a.offers.length);
  }, [groups, filtered]);

  const fakeCount = useMemo(
    () => products.filter((p) => p.discountAnalysis?.isFakeDiscount).length,
    [products]
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p className="loading-text">Finding the best prices for "{query}"...</p>
      </div>
    );
  }

  return (
    <div className="results-page">
      {backendDown && (
        <div className="demo-banner">
          Unable to reach the server. Please make sure the backend is running.
        </div>
      )}

      <div className="results-body">
        <Sidebar
          allPlatforms={allPlatforms}
          selectedPlatforms={selectedPlatforms}
          setSelectedPlatforms={handlePlatformChange}
          minPrice={minPrice}
          maxPrice={maxPrice}
          priceRange={priceRange}
          setPriceRange={handlePriceChange}
          showBestDeal={showBestDeal}
          setShowBestDeal={handleBestDeal}
          showTopRated={showTopRated}
          setShowTopRated={handleTopRated}
          onReset={handleReset}
          products={products}
        />

        <div className="results-content">
          <div className="results-top">
            <div>
              <h2 className="results-title">
                Results for: <span>"{query}"</span>
              </h2>

              <p className="results-count">
                {filtered.length} offers across {allPlatforms.length} platforms
                {groupCount > 0 && ` · grouped into ${groupCount} products`}
              </p>
            </div>

            <p className="results-freshness">
              &#8635; Last updated:{" "}
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              ,{" "}
              {new Date().toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Product Category Filter */}
          {allCategories.length > 1 && (
            <div className="category-filter">
              <button
                className={`category-filter-btn ${selectedCategory === "all" ? "active" : ""
                  }`}
                onClick={() => setSelectedCategory("all")}
              >
                All ({products.length})
              </button>

              {allCategories.map((category) => (
                <button
                  key={category}
                  className={`category-filter-btn ${selectedCategory === category ? "active" : ""
                    }`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {CATEGORY_NAMES[category] || category} ({categoryCounts[category]})
                </button>
              ))}

            </div>
          )}

          {fakeCount > 0 && (
            <div className="fake-alert-strip">
              &#9888; ShopSavvy flagged <strong>{fakeCount}</strong>{" "}
              {fakeCount === 1 ? "offer" : "offers"} with a suspicious discount claim,
              based on recorded price history.
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="no-results">
              <div className="no-results-icon">&#128269;</div>
              <h2 className="no-results-title">No results found for "{query}"</h2>
              <p className="no-results-subtitle">
                Try searching with different keywords or check your filters.
              </p>
              <div className="no-results-suggestions">
                <p>Try searching for:</p>
                <div className="no-results-chips">
                  {["iPhone 17 Pro", "iPhone 15", "Samsung Galaxy S24", "MacBook Air"].map(
                    (term) => (
                      <button
                        key={term}
                        className="search-chip"
                        onClick={() => navigate(`/results?q=${encodeURIComponent(term)}`)}
                      >
                        {term}
                      </button>
                    )
                  )}
                </div>
              </div>
              <button className="reset-btn" onClick={handleReset}>
                &#8635; Reset Filters
              </button>
            </div>
          ) : (
            <>
              <SummaryCards products={filtered} />

              {filteredGroups.map((group) => (
                <div className="product-group" key={group.productName}>
                  <div className="product-group-head">
                    <h3 className="product-group-title">{group.productName}</h3>
                    <span className="product-group-meta">
                      {group.offers.length}{" "}
                      {group.offers.length === 1 ? "offer" : "offers"}
                      {group.offers.length > 1 &&
                        ` from ${new Set(group.offers.map((o) => o.platform)).size} stores`}
                    </span>
                  </div>
                  <ComparisonTable products={group.offers} />
                </div>
              ))}
            </>
          )}

          <div className="trust-strip">
            <div className="trust-item">
              <span className="trust-icon">&#128737;</span>
              <div>
                <div className="trust-title">Verified Stores</div>
                <div className="trust-sub">Every platform carries a trust rating</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#8635;</span>
              <div>
                <div className="trust-title">Live Prices</div>
                <div className="trust-sub">Scraped on demand, cached for freshness</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#128200;</span>
              <div>
                <div className="trust-title">Price History</div>
                <div className="trust-sub">Every price change is recorded</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#9888;</span>
              <div>
                <div className="trust-title">Fake Discount Detection</div>
                <div className="trust-sub">Claims checked against real history</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;