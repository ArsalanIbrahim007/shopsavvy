import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { DUMMY_PRODUCTS } from "../data/dummyProducts";
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
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const result = await searchProducts(query);
      if (result && result.products && result.products.length > 0) {
        setProducts(result.products);
        setUsingDummy(false);
      } else {
        setProducts(DUMMY_PRODUCTS);
        setUsingDummy(true);
      }
      setLoading(false);
    }
    if (query) fetchData();
  }, [query]);

  const allPlatforms = useMemo(() => {
    return [...new Set(products.map((p) => p.platform))];
  }, [products]);

  const minPrice = useMemo(() => {
    if (products.length === 0) return 0;
    return Math.min(...products.map((p) => p.price));
  }, [products]);

  const maxPrice = useMemo(() => {
    if (products.length === 0) return 100000;
    return Math.max(...products.map((p) => p.price));
  }, [products]);

  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [showBestDeal, setShowBestDeal] = useState(false);
  const [showTopRated, setShowTopRated] = useState(false);

  useEffect(() => {
    if (allPlatforms.length > 0) {
      const urlPlatforms = searchParams.get("platforms");
      const urlMinPrice = searchParams.get("minPrice");
      const urlMaxPrice = searchParams.get("maxPrice");
      const urlBestDeal = searchParams.get("bestDeal");
      const urlTopRated = searchParams.get("topRated");

      setSelectedPlatforms(
        urlPlatforms ? urlPlatforms.split(",") : allPlatforms
      );
      setPriceRange([
        urlMinPrice ? Number(urlMinPrice) : minPrice,
        urlMaxPrice ? Number(urlMaxPrice) : maxPrice,
      ]);
      setShowBestDeal(urlBestDeal === "true");
      setShowTopRated(urlTopRated === "true");
    }
  }, [allPlatforms, minPrice, maxPrice]);

  function updateURL(platforms, price, bestDeal, topRated) {
    const params = { q: query };
    if (platforms.length !== allPlatforms.length) {
      params.platforms = platforms.join(",");
    }
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
    results = results.filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    );
    if (showBestDeal) results = results.filter((p) => p.isBestDeal === true);
    if (showTopRated) results.sort((a, b) => b.rating - a.rating);
    return results;
  }, [products, selectedPlatforms, priceRange, showBestDeal, showTopRated]);

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
      {usingDummy && (
        <div className="demo-banner">
          Demo mode — showing sample data. Connect backend for real results.
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
                {filtered.length} product found across {allPlatforms.length} platforms
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

          {filtered.length === 0 && !loading ? (
            <div className="no-results">
              <div className="no-results-icon">&#128269;</div>
              <h2 className="no-results-title">No results found for "{query}"</h2>
              <p className="no-results-subtitle">
                Try searching with different keywords or check your filters.
              </p>
              <div className="no-results-suggestions">
                <p>Try searching for:</p>
                <div className="no-results-chips">
                  {["iPhone 15", "Samsung S25", "HP Laptop", "MacBook Air"].map((term) => (
                    <button
                      key={term}
                      className="search-chip"
                      onClick={() => navigate(`/results?q=${encodeURIComponent(term)}`)}
                    >
                      {term}
                    </button>
                  ))}
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
                <div className="trust-title">Safe Shopping</div>
                <div className="trust-sub">All stores are verified and trusted</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#8635;</span>
              <div>
                <div className="trust-title">Live Updates</div>
                <div className="trust-sub">Prices updated regularly</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#127991;</span>
              <div>
                <div className="trust-title">Best Prices</div>
                <div className="trust-sub">We find the lowest prices for you</div>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">&#128274;</span>
              <div>
                <div className="trust-title">Secure Deals</div>
                <div className="trust-sub">Your data is safe with us</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;