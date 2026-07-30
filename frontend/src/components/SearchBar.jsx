function SearchBar({ query, setQuery, onSearch }) {
  function handleKeyDown(e) {
    if (e.key === "Enter") {
      onSearch();
    }
  }

  return (
    <div className="searchbar-container">
      <input
        type="text"
        className="searchbar-input"
        placeholder="Search for a product e.g. iPhone 15"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button className="searchbar-button" onClick={onSearch}>
        Search
      </button>
    </div>
  );
}

export default SearchBar;