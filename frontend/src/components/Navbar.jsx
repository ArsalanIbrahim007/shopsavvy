import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

const SUGGESTIONS = [
  "iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max",
  "iPhone 14", "iPhone 16", "iPhone 16 Pro Max",
  "Samsung Galaxy S25", "Samsung Galaxy A55", "Samsung Galaxy A35",
  "Samsung Galaxy S24", "Samsung Galaxy S23",
  "HP Laptop", "HP 15s", "HP Pavilion", "HP EliteBook",
  "Dell Laptop", "Dell Inspiron", "Dell XPS",
  "MacBook Air", "MacBook Pro",
  "Xiaomi 14", "Xiaomi 13", "Xiaomi Redmi Note 13",
  "OnePlus 12", "OnePlus Nord",
  "Lenovo IdeaPad", "Lenovo ThinkPad",
  "Asus VivoBook", "Asus ZenBook",
  "Sony Headphones", "JBL Speaker",
  "AirPods Pro", "Samsung Buds",
];

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResultsPage = location.pathname === "/results";
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (isResultsPage) {
      setQuery(searchParams.get("q") || "");
    }
  }, [isResultsPage, searchParams]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    setActiveSuggestion(-1);

    if (val.trim().length > 1) {
      const filtered = SUGGESTIONS.filter((s) =>
        s.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 6);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSearch(searchQuery) {
    const q = searchQuery || query;
    if (q.trim() === "") return;
    setShowSuggestions(false);
    navigate(`/results?q=${encodeURIComponent(q)}`);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      setActiveSuggestion((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      setActiveSuggestion((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
        handleSearch(suggestions[activeSuggestion]);
      } else {
        handleSearch();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Shop<span>Savvy</span></Link>
        {!isResultsPage && (
          <div className="navbar-tagline">Compare prices. Save more.</div>
        )}
      </div>

      {isResultsPage && (
        <div className="navbar-search" ref={wrapperRef}>
          <div className="navbar-searchbar">
            <span className="navbar-search-icon">&#128269;</span>
            <input
              type="text"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Search for a product..."
              className="navbar-search-input"
              autoComplete="off"
            />
            <button className="navbar-search-btn" onClick={() => handleSearch()}>
              Search
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown navbar-suggestions">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  className={`suggestion-item ${index === activeSuggestion ? "active" : ""}`}
                  onMouseDown={() => handleSearch(suggestion)}
                >
                  <span className="suggestion-icon">&#128269;</span>
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="navbar-right">
        <div className="navbar-badge">
          Made for Pakistani Shoppers &#127477;&#127472;
        </div>
      </div>
    </nav>
  );
}

export default Navbar;