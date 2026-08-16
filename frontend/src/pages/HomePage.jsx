import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";

const POPULAR_SEARCHES = [
  "iPhone 17",
  "Samsung S25",
  "HP Laptop",
  "Xiaomi 14",
  "MacBook Air",
  "Samsung Galaxy A55",
];

const CATEGORIES = [
  {
    id: "phones",
    icon: "📱",
    title: "Mobile Phones",
    desc: "Compare prices on latest smartphones",
    color: "#eff6ff",
    iconBg: "#2563eb",
    brands: [
      { label: "Apple", query: "iphone" },
      { label: "Samsung", query: "samsung galaxy" },
      { label: "Xiaomi", query: "xiaomi" },
      { label: "Google", query: "google pixel" },
      { label: "OnePlus", query: "oneplus" },
    ],
    popular: [
      "iPhone 17",
      "iPhone 16 Pro",
      "Samsung Galaxy S25",
      "Samsung Galaxy S24",
      "Xiaomi 14",
    ],
  },
  {
    id: "laptops",
    icon: "💻",
    title: "Laptops",
    desc: "Find the best deals on laptops",
    color: "#f0fdf4",
    iconBg: "#16a34a",
    brands: [
      { label: "HP", query: "hp laptop" },
      { label: "Dell", query: "dell laptop" },
      { label: "Lenovo", query: "lenovo laptop" },
      { label: "ASUS", query: "asus laptop" },
      { label: "Apple", query: "macbook" },
    ],
    popular: [
      "HP Pavilion",
      "Dell Inspiron",
      "Lenovo IdeaPad",
      "ASUS VivoBook",
      "MacBook Air",
    ],
  },
  {
    id: "accessories",
    icon: "🎧",
    title: "Accessories",
    desc: "Headphones, earbuds, chargers and more",
    color: "#fefce8",
    iconBg: "#d97706",
    brands: [
      { label: "Apple", query: "airpods" },
      { label: "Samsung", query: "samsung buds" },
      { label: "Sony", query: "sony headphones" },
      { label: "JBL", query: "jbl headphones" },
      { label: "Anker", query: "anker charger" },
    ],
    popular: [
      "AirPods Pro",
      "Samsung Buds",
      "Sony Headphones",
      "Power Bank",
      "USB-C Charger",
    ],
  },
  {
    id: "electronics",
    icon: "📷",
    title: "Electronics",
    desc: "TVs, cameras, monitors and gadgets",
    color: "#fdf2f8",
    iconBg: "#9333ea",
    brands: [
      { label: "Samsung TVs", query: "samsung tv" },
      { label: "LG TVs", query: "lg tv" },
      { label: "Canon", query: "canon camera" },
      { label: "Nikon", query: "nikon camera" },
      { label: "Monitors", query: "monitor" },
    ],
    popular: [
      "Samsung TV",
      "LED TV",
      "Gaming Monitor",
      "Canon Camera",
      "Sony Camera",
    ],
  },
];

const PHONE_BRANDS = [
  { label: "All", query: "smartphone" },
  { label: "Apple", query: "iphone" },
  { label: "Samsung", query: "samsung galaxy" },
  { label: "Xiaomi", query: "xiaomi" },
  { label: "Infinix", query: "infinix" },
  { label: "Tecno", query: "tecno" },
  { label: "Oppo", query: "oppo" },
  { label: "Vivo", query: "vivo" },
];

const LAPTOP_BRANDS = [
  { label: "All", query: "laptop" },
  { label: "HP", query: "hp laptop" },
  { label: "Dell", query: "dell laptop" },
  { label: "Lenovo", query: "lenovo laptop" },
  { label: "ASUS", query: "asus laptop" },
  { label: "Apple", query: "macbook" },
  { label: "Acer", query: "acer laptop" },
];

function useCountUp(target, duration = 1500, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || target === 0) return;
    let startTime = null;
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
      else setCount(target);
    }
    requestAnimationFrame(animate);
  }, [target, duration, start]);
  return count;
}

function StatItem({ icon, value, suffix, label, start }) {
  const count = useCountUp(value, 1500, start);
  return (
    <div className="stat-item">
      <div className="stat-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="stat-value">{count}{suffix}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ProductCarouselCard({ product }) {
  const navigate = useNavigate();
  const discount = product.discountAnalysis?.claimedDiscountPercent;
  return (
    <div className="carousel-card" onClick={() => navigate(`/product/${product._id}`)}>
      <div className="carousel-card-img-wrapper">
        <img
          src={product.imageUrl || "https://placehold.co/200x200/f8fafc/94a3b8?text=No+Image"}
          alt={product.title}
          className="carousel-card-img"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.target.src = "https://placehold.co/200x200/f8fafc/94a3b8?text=No+Image";
          }}
        />
        {discount > 0 && (
          <div className="carousel-discount-badge">{discount}% OFF</div>
        )}
      </div>
      <div className="carousel-card-body">
        <div className="carousel-platform">{product.platform}</div>
        <div className="carousel-title">{product.title}</div>
        <div className="carousel-price-row">
          <div className="carousel-price">PKR {product.price?.toLocaleString()}</div>
          {product.originalPrice && product.originalPrice > product.price && (
            <div className="carousel-original">PKR {product.originalPrice?.toLocaleString()}</div>
          )}
        </div>
        <button type="button" className="carousel-btn">View Deal</button>
      </div>
    </div>
  );
}

function Carousel({ title, sectionBg, products, loading, brandFilters, onBrandSelect, activeBrand }) {
  const scrollRef = useRef(null);

  function scrollLeft() {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -320, behavior: "smooth" });
    }
  }

  function scrollRight() {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: "smooth" });
    }
  }

  return (
    <div className="carousel-section" style={{ background: sectionBg }}>
      <div className="carousel-header">
        <h2 className="carousel-section-title">{title}</h2>
        <div className="carousel-nav">
          <button className="carousel-nav-btn" onClick={scrollLeft}>&#8592;</button>
          <button className="carousel-nav-btn" onClick={scrollRight}>&#8594;</button>
        </div>
      </div>

      {brandFilters && (
        <div className="carousel-brand-filters">
          {brandFilters.map((brand) => (
            <button
              key={brand.label}
              type="button"
              className={`carousel-brand-btn ${activeBrand === brand.query ? "active" : ""}`}
              onClick={() => onBrandSelect(brand.query)}
            >
              {brand.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="carousel-loading">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="carousel-empty">No products found</div>
      ) : (
        <div className="carousel-track" ref={scrollRef}>
          {products.map((product) => (
            <ProductCarouselCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomePage() {
  const [query, setQuery] = useState("");
  const [selectedBrowseCategory, setSelectedBrowseCategory] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [stats, setStats] = useState({ products: 0, platforms: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [animateStats, setAnimateStats] = useState(false);

  const [featuredDeals, setFeaturedDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);

  const [phoneProducts, setPhoneProducts] = useState([]);
  const [phonesLoading, setPhonesLoading] = useState(true);
  const [activeBrandPhone, setActiveBrandPhone] = useState("smartphone");

  const [laptopProducts, setLaptopProducts] = useState([]);
  const [laptopsLoading, setLaptopsLoading] = useState(true);
  const [activeBrandLaptop, setActiveBrandLaptop] = useState("laptop");

  const statsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem("recentSearches");
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("http://localhost:5000/api/listings");
        const data = await response.json();
        if (data.success) {
          const platforms = [...new Set(data.data.map((p) => p.platform))];
          setStats({ products: data.count, platforms: platforms.length });
          setStatsLoaded(true);
        }
      } catch {
        setStats({ products: 1200, platforms: 6 });
        setStatsLoaded(true);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    async function fetchDeals() {
      try {
        const searches = ["iphone", "samsung", "laptop"];
        const results = await Promise.all(
          searches.map((q) =>
            fetch(`http://localhost:5000/api/listings/search?q=${q}`)
              .then((r) => r.json())
              .then((d) => (d.success ? d.data : []))
              .catch(() => [])
          )
        );
        const allProducts = results.flat();
        const seen = new Set();
        const unique = allProducts.filter((p) => {
          if (seen.has(p._id)) return false;
          seen.add(p._id);
          return true;
        });
        const sorted = unique
          .filter((p) => p.dealScore > 0)
          .sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0))
          .slice(0, 12);
        setFeaturedDeals(sorted.length > 0 ? sorted : unique.slice(0, 12));
      } catch {
        setFeaturedDeals([]);
      } finally {
        setDealsLoading(false);
      }
    }
    fetchDeals();
  }, []);

  useEffect(() => {
    async function fetchPhones() {
      setPhonesLoading(true);
      try {
        const response = await fetch(
          `http://localhost:5000/api/listings/search?q=${encodeURIComponent(activeBrandPhone)}`
        );
        const data = await response.json();
        const products = data.success ? data.data.slice(0, 12) : [];
        setPhoneProducts(products);
      } catch {
        setPhoneProducts([]);
      } finally {
        setPhonesLoading(false);
      }
    }
    fetchPhones();
  }, [activeBrandPhone]);

  useEffect(() => {
    async function fetchLaptops() {
      setLaptopsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:5000/api/listings/search?q=${encodeURIComponent(activeBrandLaptop)}`
        );
        const data = await response.json();
        const products = data.success ? data.data.slice(0, 12) : [];
        setLaptopProducts(products);
      } catch {
        setLaptopProducts([]);
      } finally {
        setLaptopsLoading(false);
      }
    }
    fetchLaptops();
  }, [activeBrandLaptop]);

  useEffect(() => {
    if (!statsLoaded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimateStats(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, [statsLoaded]);

  function handleSearch(searchQuery) {
    const search = searchQuery || query;
    if (search.trim() === "") return;
    const updated = [
      search,
      ...recentSearches.filter((item) => item.toLowerCase() !== search.toLowerCase()),
    ].slice(0, 5);
    setRecentSearches(updated);
    sessionStorage.setItem("recentSearches", JSON.stringify(updated));
    navigate(`/results?q=${encodeURIComponent(search)}`);
  }

  function clearRecent() {
    setRecentSearches([]);
    sessionStorage.removeItem("recentSearches");
  }

  function toggleBrowseCategory(category) {
    setSelectedBrowseCategory((current) =>
      current?.id === category.id ? null : category
    );
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <div className="home-badge">&#127477;&#127472; Made for Pakistani Shoppers</div>
        <h1 className="home-title">
          Find the <span>Best Price</span> in Pakistan
        </h1>
        <p className="home-subtitle">
          Search once and instantly compare prices from multiple Pakistani ecommerce stores in one place.
        </p>

        <SearchBar query={query} setQuery={setQuery} onSearch={handleSearch} />

        <div className="popular-searches">
          <span className="searches-label">Popular:</span>
          {POPULAR_SEARCHES.map((term) => (
            <button type="button" key={term} className="search-chip" onClick={() => handleSearch(term)}>
              {term}
            </button>
          ))}
        </div>

        {recentSearches.length > 0 && (
          <div className="recent-searches">
            <div className="recent-searches-header">
              <span className="searches-label">Recent:</span>
              <button type="button" className="clear-recent" onClick={clearRecent}>Clear</button>
            </div>
            <div className="recent-chips">
              {recentSearches.map((term) => (
                <button type="button" key={term} className="search-chip recent" onClick={() => handleSearch(term)}>
                  &#128336; {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="categories-section">
        <h2 className="categories-title">Browse by Category</h2>
        <div className="categories-grid">
          {CATEGORIES.map((category) => {
            const isActive = selectedBrowseCategory?.id === category.id;
            return (
              <button
                type="button"
                key={category.id}
                className={`category-card ${isActive ? "active" : ""}`}
                style={{ background: category.color }}
                onClick={() => toggleBrowseCategory(category)}
              >
                <div className="category-icon-wrapper" style={{ background: category.iconBg }}>
                  <span className="category-icon">{category.icon}</span>
                </div>
                <div className="category-info">
                  <div className="category-title">{category.title}</div>
                  <div className="category-desc">{category.desc}</div>
                </div>
                <div className="category-arrow">{isActive ? "−" : "→"}</div>
              </button>
            );
          })}
        </div>

        {selectedBrowseCategory && (
          <div className="category-explorer">
            <div className="category-explorer-header">
              <div>
                <span className="category-explorer-label">Browse category</span>
                <h3>{selectedBrowseCategory.icon} {selectedBrowseCategory.title}</h3>
                <p>Select a brand or popular product to compare prices.</p>
              </div>
              <button type="button" className="category-explorer-close" onClick={() => setSelectedBrowseCategory(null)}>
                &times;
              </button>
            </div>
            <div className="category-explorer-content">
              <div className="category-explorer-group">
                <h4>Browse by Brand</h4>
                <div className="category-explorer-options">
                  {selectedBrowseCategory.brands.map((brand) => (
                    <button type="button" key={brand.label} onClick={() => handleSearch(brand.query)}>
                      {brand.label} <span>&#8594;</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="category-explorer-group">
                <h4>Popular Products</h4>
                <div className="category-explorer-options popular">
                  {selectedBrowseCategory.popular.map((product) => (
                    <button type="button" key={product} onClick={() => handleSearch(product)}>
                      {product}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Carousel
        title="🔥 Today's Best Deals"
        sectionBg="white"
        products={featuredDeals}
        loading={dealsLoading}
      />

      <Carousel
        title="📱 Popular Smartphones"
        sectionBg="#f0f9ff"
        products={phoneProducts}
        loading={phonesLoading}
        brandFilters={PHONE_BRANDS}
        activeBrand={activeBrandPhone}
        onBrandSelect={setActiveBrandPhone}
      />

      <Carousel
        title="💻 Popular Laptops"
        sectionBg="#f0fdf4"
        products={laptopProducts}
        loading={laptopsLoading}
        brandFilters={LAPTOP_BRANDS}
        activeBrand={activeBrandLaptop}
        onBrandSelect={setActiveBrandLaptop}
      />

      <div className="how-it-works">
        <h2 className="how-title">How ShopSavvy Works</h2>
        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-number">1</div>
            <div className="how-step-icon">&#128269;</div>
            <div className="how-step-title">Search</div>
            <div className="how-step-desc">Type any product name like iPhone 17 or HP Laptop</div>
          </div>
          <div className="how-step-arrow">&#8594;</div>
          <div className="how-step">
            <div className="how-step-number">2</div>
            <div className="how-step-icon">&#128203;</div>
            <div className="how-step-title">Compare</div>
            <div className="how-step-desc">See prices from PriceOye, Mega.pk, Shophive and more side by side</div>
          </div>
          <div className="how-step-arrow">&#8594;</div>
          <div className="how-step">
            <div className="how-step-number">3</div>
            <div className="how-step-icon">&#128176;</div>
            <div className="how-step-title">Save</div>
            <div className="how-step-desc">Click View Deal on the best price and buy directly from the store</div>
          </div>
        </div>
      </div>

      <div className="stats-strip" ref={statsRef}>
        <StatItem icon="&#128722;" value={stats.products} suffix="+" label="Products Tracked" start={animateStats} />
        <StatItem icon="&#127760;" value={stats.platforms} suffix="" label="Platforms Compared" start={animateStats} />
        <StatItem icon="&#9201;" value={100} suffix="%" label="Price Updates Daily" start={animateStats} />
        <StatItem icon="&#128176;" value={100} suffix="%" label="Free to Use" start={animateStats} />
      </div>
    </div>
  );
}

export default HomePage;