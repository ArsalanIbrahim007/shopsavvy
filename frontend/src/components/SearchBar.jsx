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

function SearchBar({ query, setQuery, onSearch }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const wrapperRef = useRef(null);

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

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      setActiveSuggestion((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      setActiveSuggestion((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
        setQuery(suggestions[activeSuggestion]);
        setShowSuggestions(false);
        onSearch(suggestions[activeSuggestion]);
      } else {
        setShowSuggestions(false);
        onSearch();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function handleSuggestionClick(suggestion) {
    setQuery(suggestion);
    setShowSuggestions(false);
    onSearch(suggestion);
  }

  return (
    <div className="searchbar-wrapper" ref={wrapperRef}>
      <div className="searchbar-container">
        <input
          type="text"
          className="searchbar-input"
          placeholder="Search for a product e.g. iPhone 15"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          autoComplete="off"
        />
        <button
          className="searchbar-button"
          onClick={() => {
            setShowSuggestions(false);
            onSearch();
          }}
        >
          Search
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={`suggestion-item ${index === activeSuggestion ? "active" : ""}`}
              onMouseDown={() => handleSuggestionClick(suggestion)}
            >
              <span className="suggestion-icon">&#128269;</span>
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;