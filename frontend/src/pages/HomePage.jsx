import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";

const POPULAR_SEARCHES = [
  "iPhone 15",
  "Samsung S25",
  "HP Laptop",
  "Xiaomi 14",
  "MacBook Air",
  "Samsung Galaxy A55",
];

const CATEGORIES = [
  {
    icon: "📱",
    title: "Mobile Phones",
    desc: "Compare prices on latest smartphones",
    query: "iphone samsung xiaomi",
    color: "#e8f0fe",
    iconBg: "#1a73e8",
  },
  {
    icon: "💻",
    title: "Laptops",
    desc: "Find the best deals on laptops",
    query: "laptop",
    color: "#e8f5e9",
    iconBg: "#43a047",
  },
  {
    icon: "🎧",
    title: "Accessories",
    desc: "Headphones, cases, cables and more",
    query: "headphones earphones",
    color: "#fff8e1",
    iconBg: "#f9a825",
  },
  {
    icon: "📷",
    title: "Electronics",
    desc: "Cameras, speakers and gadgets",
    query: "camera speaker gadget",
    color: "#fce4ec",
    iconBg: "#e91e63",
  },
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

function FeaturedDealCard({ product }) {
  const navigate = useNavigate();
  return (
    <div
      className="featured-card"
      onClick={() => navigate(`/product/${product._id}`)}
    >
      <div className="featured-card-img-wrapper">
        <img
          src={product.imageUrl || "https://placehold.co/200x200/f5f7fb/333?text=No+Image"}
          alt={product.title}
          className="featured-card-img"
          onError={(e) => {
            e.target.src = "https://placehold.co/200x200/f5f7fb/333?text=No+Image";
          }}
        />
        {product.discountPercent > 0 && (
          <div className="featured-discount-badge">
            {product.discountPercent}% OFF
          </div>
        )}
      </div>
      <div className="featured-card-body">
        <div className="featured-platform">{product.platform}</div>
        <div className="featured-card-title">{product.title}</div>
        <div className="featured-price-row">
          <div className="featured-price">
            PKR {product.price?.toLocaleString()}
          </div>
          {product.originalPrice && product.originalPrice > product.price && (
            <div className="featured-original">
              PKR {product.originalPrice?.toLocaleString()}
            </div>
          )}
        </div>
        <button className="featured-btn">View Deal</button>
      </div>
    </div>
  );
}

function HomePage() {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState([]);
  const [stats, setStats] = useState({ products: 0, platforms: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [animateStats, setAnimateStats] = useState(false);
  const [featuredDeals, setFeaturedDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
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
      } catch (err) {
        setStats({ products: 1200, platforms: 6 });
        setStatsLoaded(true);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    async function fetchFeaturedDeals() {
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
          .slice(0, 8);

        setFeaturedDeals(sorted.length > 0 ? sorted : unique.slice(0, 8));
      } catch (err) {
        setFeaturedDeals([]);
      } finally {
        setDealsLoading(false);
      }
    }
    fetchFeaturedDeals();
  }, []);

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
    const q = searchQuery || query;
    if (q.trim() === "") return;
    const updated = [
      q,
      ...recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase()),
    ].slice(0, 5);
    setRecentSearches(updated);
    sessionStorage.setItem("recentSearches", JSON.stringify(updated));
    navigate(`/results?q=${encodeURIComponent(q)}`);
  }

  function clearRecent() {
    setRecentSearches([]);
    sessionStorage.removeItem("recentSearches");
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <div className="home-badge">&#127477;&#127472; Made for Pakistani Shoppers</div>
        <h1 className="home-title">
          Find the <span>Best Price</span> in Pakistan
        </h1>
        <p className="home-subtitle">
          Search once and instantly compare prices from multiple Pakistani
          ecommerce stores in one place.
        </p>

        <SearchBar
          query={query}
          setQuery={setQuery}
          onSearch={handleSearch}
        />

        <div className="popular-searches">
          <span className="searches-label">Popular:</span>
          {POPULAR_SEARCHES.map((term) => (
            <button
              key={term}
              className="search-chip"
              onClick={() => handleSearch(term)}
            >
              {term}
            </button>
          ))}
        </div>

        {recentSearches.length > 0 && (
          <div className="recent-searches">
            <div className="recent-searches-header">
              <span className="searches-label">Recent:</span>
              <button className="clear-recent" onClick={clearRecent}>
                Clear
              </button>
            </div>
            <div className="recent-chips">
              {recentSearches.map((term) => (
                <button
                  key={term}
                  className="search-chip recent"
                  onClick={() => handleSearch(term)}
                >
                  &#128336; {term}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="home-platforms">
          Comparing prices from
          <br />
          <span>PriceOye</span>
          <span>Mega.pk</span>
          <span>Shophive</span>
          <span>HomeShopping</span>
          <span>Telemart</span>
        </div>
      </div>

      <div className="categories-section">
        <h2 className="categories-title">Browse by Category</h2>
        <div className="categories-grid">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.title}
              className="category-card"
              style={{ background: cat.color }}
              onClick={() => handleSearch(cat.query)}
            >
              <div
                className="category-icon-wrapper"
                style={{ background: cat.iconBg }}
              >
                <span className="category-icon">{cat.icon}</span>
              </div>
              <div className="category-info">
                <div className="category-title">{cat.title}</div>
                <div className="category-desc">{cat.desc}</div>
              </div>
              <div className="category-arrow">&#8594;</div>
            </div>
          ))}
        </div>
      </div>

      {!dealsLoading && featuredDeals.length > 0 && (
        <div className="featured-section">
          <div className="featured-header">
            <h2 className="featured-title">&#128293; Today's Best Deals</h2>
            <button
              className="featured-view-all"
              onClick={() => handleSearch("iphone")}
            >
              View All &#8594;
            </button>
          </div>
          <div className="featured-grid">
            {featuredDeals.map((product) => (
              <FeaturedDealCard key={product._id} product={product} />
            ))}
          </div>
        </div>
      )}

      {dealsLoading && (
        <div className="featured-section">
          <div className="featured-header">
            <h2 className="featured-title">&#128293; Today's Best Deals</h2>
          </div>
          <div className="featured-loading">
            <div className="loading-spinner" />
            <p>Loading best deals...</p>
          </div>
        </div>
      )}

      <div className="how-it-works">
        <h2 className="how-title">How ShopSavvy Works</h2>
        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-number">1</div>
            <div className="how-step-icon">&#128269;</div>
            <div className="how-step-title">Search</div>
            <div className="how-step-desc">
              Type any product name like iPhone 15 or HP Laptop
            </div>
          </div>
          <div className="how-step-arrow">&#8594;</div>
          <div className="how-step">
            <div className="how-step-number">2</div>
            <div className="how-step-icon">&#128203;</div>
            <div className="how-step-title">Compare</div>
            <div className="how-step-desc">
              See prices from PriceOye, Mega.pk, Shophive and more side by side
            </div>
          </div>
          <div className="how-step-arrow">&#8594;</div>
          <div className="how-step">
            <div className="how-step-number">3</div>
            <div className="how-step-icon">&#128176;</div>
            <div className="how-step-title">Save</div>
            <div className="how-step-desc">
              Click View Deal on the best price and buy directly from the store
            </div>
          </div>
        </div>
      </div>

      <div className="stats-strip" ref={statsRef}>
        <StatItem
          icon="&#128722;"
          value={stats.products}
          suffix="+"
          label="Products Tracked"
          start={animateStats}
        />
        <StatItem
          icon="&#127760;"
          value={stats.platforms}
          suffix=""
          label="Platforms Compared"
          start={animateStats}
        />
        <StatItem
          icon="&#9201;"
          value={100}
          suffix="%"
          label="Price Updates Daily"
          start={animateStats}
        />
        <StatItem
          icon="&#128176;"
          value={100}
          suffix="%"
          label="Free to Use"
          start={animateStats}
        />
      </div>
    </div>
  );
}

export default HomePage;