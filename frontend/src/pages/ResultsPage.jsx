import { useSearchParams } from "react-router-dom";
import { useState, useMemo } from "react";
import ProductCard from "../components/ProductCard";
import Sidebar from "../components/Sidebar";

const DUMMY_PRODUCTS = [
  {
    _id: "1",
    platform: "PriceOye",
    title: "Apple iPhone 15 128GB PTA Approved",
    price: 269999,
    originalPrice: 310000,
    discountPercent: 13,
    productUrl: "https://priceoye.pk",
    imageUrl: "",
    category: "Mobile Phones",
    sellerName: "PriceOye Official",
    rating: 4,
    reviewCount: 128,
    deliveryFee: 0,
    availability: "In Stock",
    lastScrapedAt: new Date().toISOString(),
    isBestDeal: true,
    isSuspicious: false,
  },
  {
    _id: "2",
    platform: "Mega.pk",
    title: "Apple iPhone 15 128GB",
    price: 285000,
    originalPrice: 320000,
    discountPercent: 11,
    productUrl: "https://mega.pk",
    imageUrl: "",
    category: "Mobile Phones",
    sellerName: "Mega Store",
    rating: 3,
    reviewCount: 45,
    deliveryFee: 200,
    availability: "In Stock",
    lastScrapedAt: new Date().toISOString(),
    isBestDeal: false,
    isSuspicious: false,
  },
  {
    _id: "3",
    platform: "Shophive",
    title: "iPhone 15 128GB Space Black",
    price: 299999,
    originalPrice: 599999,
    discountPercent: 50,
    productUrl: "https://shophive.com",
    imageUrl: "",
    category: "Mobile Phones",
    sellerName: "Shophive",
    rating: 2,
    reviewCount: 12,
    deliveryFee: 0,
    availability: "Limited Stock",
    lastScrapedAt: new Date().toISOString(),
    isBestDeal: false,
    isSuspicious: true,
  },
];

function ResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q");

  const allPlatforms = useMemo(() => {
    const platforms = DUMMY_PRODUCTS.map((p) => p.platform);
    return [...new Set(platforms)];
  }, []);

  const minPrice = useMemo(() => {
    return Math.min(...DUMMY_PRODUCTS.map((p) => p.price));
  }, []);

  const maxPrice = useMemo(() => {
    return Math.max(...DUMMY_PRODUCTS.map((p) => p.price));
  }, []);

  const [selectedPlatforms, setSelectedPlatforms] = useState(allPlatforms);
  const [priceRange, setPriceRange] = useState([minPrice, maxPrice]);
  const [showBestDeal, setShowBestDeal] = useState(false);
  const [showTopRated, setShowTopRated] = useState(false);

  function handleReset() {
    setSelectedPlatforms(allPlatforms);
    setPriceRange([minPrice, maxPrice]);
    setShowBestDeal(false);
    setShowTopRated(false);
  }

  const filtered = useMemo(() => {
    let results = [...DUMMY_PRODUCTS];

    results = results.filter((p) =>
      selectedPlatforms.includes(p.platform)
    );

    results = results.filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    );

    if (showBestDeal) {
      results = results.filter((p) => p.isBestDeal === true);
    }

    if (showTopRated) {
      results.sort((a, b) => b.rating - a.rating);
    }

    return results;
  }, [selectedPlatforms, priceRange, showBestDeal, showTopRated]);

  return (
    <div className="results-page">
      <div className="results-top">
        <h2 className="results-title">
          Results for: <span>"{query}"</span>
        </h2>
        <p className="results-count">
          {filtered.length} products found across platforms
        </p>
      </div>

      <div className="results-layout">
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
        />

        <div className="products-area">
          {filtered.length === 0 ? (
            <p className="results-placeholder">
              No products match your filters.
            </p>
          ) : (
            <div className="products-list">
              {filtered.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;