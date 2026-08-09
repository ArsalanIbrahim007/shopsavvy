import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { searchProducts } from "../api/api";
import Sidebar from "../components/Sidebar";
import SummaryCards from "../components/SummaryCards";
import ProductHeader from "../components/ProductHeader";
import ComparisonTable from "../components/ComparisonTable";

function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q");

  const [products, setProducts] = useState([]);
  const [groupCount, setGroupCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const result = await searchProducts(query);
      setProducts(result.products);
      setGroupCount(result.groupCount);
      setBackendDown(result.error);
      setLoading(false);
    }
    if (query) fetchData();
  }, [query]);

  const allPlatforms = useMemo(
    () => [...new Set(products.map((p) => p.platform))],
    [products]
  );

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

    results = results.filter((p) => selectedPlatforms.includes(p.platform));
    results = results.filter((p) => p.price >= priceRange[0] && p.price <= priceRange[1]);

    // "Best deals only" now uses the backend's recommendation engine rather
    // than a flag that no longer exists on live data.
    if (showBestDeal) {
      results = results.filter((p) =>
        ["BUY_NOW", "GOOD_DEAL"].includes(p.recommendation?.action)
      );
    }

    // Sort by the computed deal score instead of a rating field.
    if (showTopRated) {
      results.sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
    }

    return results;
  }, [products, selectedPlatforms, priceRange, showBestDeal, showTopRated]);

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
              <ProductHeader products={filtered} />
              <ComparisonTable products={filtered} />
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