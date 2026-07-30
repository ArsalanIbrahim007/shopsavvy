import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResultsPage = location.pathname === "/results";
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isResultsPage) {
      setQuery(searchParams.get("q") || "");
    }
  }, [isResultsPage, searchParams]);

  function handleSearch() {
    if (query.trim() === "") return;
    navigate(`/results?q=${encodeURIComponent(query)}`);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSearch();
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
        <div className="navbar-search">
          <div className="navbar-searchbar">
            <span className="navbar-search-icon">&#128269;</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for a product..."
              className="navbar-search-input"
            />
            <button className="navbar-search-btn" onClick={handleSearch}>
              Search
            </button>
          </div>
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