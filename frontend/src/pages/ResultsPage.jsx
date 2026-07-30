import { useSearchParams } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { DUMMY_PRODUCTS } from "../data/dummyProducts";
import { searchProducts } from "../api/api";
import Sidebar from "../components/Sidebar";
import SummaryCards from "../components/SummaryCards";
import ProductHeader from "../components/ProductHeader";
import ComparisonTable from "../components/ComparisonTable";

function ResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const result = await searchProducts(query);

      if (result) {
        setProducts(result);
        setUsingDummy(false);
      } else {
        setProducts(DUMMY_PRODUCTS);
        setUsingDummy(true);
      }

      setLoading(false);
    }

    if (query) {
      fetchData();
    }
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
    setSelectedPlatforms(allPlatforms);
    setPriceRange([minPrice, maxPrice]);
  }, [allPlatforms, minPrice, maxPrice]);

  function handleReset() {
    setSelectedPlatforms(allPlatforms);
    setPriceRange([minPrice, maxPrice]);
    setShowBestDeal(false);
    setShowTopRated(false);
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
          setSelectedPlatforms={setSelectedPlatforms}
          minPrice={minPrice}
          maxPrice={maxPrice}
          priceRange={priceRange}
          setPriceRange={setPriceRange}
          showBestDeal={showBestDeal}
          setShowBestDeal={setShowBestDeal}
          showTopRated={showTopRated}
          setShowTopRated={setShowTopRated}
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

          <SummaryCards products={filtered} />
          <ProductHeader products={filtered} />

          {filtered.length === 0 ? (
            <p className="results-placeholder">
              No products match your filters.
            </p>
          ) : (
            <ComparisonTable products={filtered} />
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