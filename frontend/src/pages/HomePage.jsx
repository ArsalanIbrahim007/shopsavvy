import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";

function HomePage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function handleSearch() {
    if (query.trim() === "") return;
    navigate(`/results?q=${query}`);
  }

  return (
    <div className="home-container">
      <div className="home-badge">🇵🇰 Made for Pakistani Shoppers</div>
      <h1 className="home-title">
        Find the <span>Best Price</span> in Pakistan
      </h1>
      <p className="home-subtitle">
        Search once and instantly compare prices from multiple Pakistani
        ecommerce stores in one place.
      </p>
      <SearchBar query={query} setQuery={setQuery} onSearch={handleSearch} />
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
  );
}

export default HomePage;