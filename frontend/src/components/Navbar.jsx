import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Shop<span>Savvy</span></Link>
      </div>
      <div className="navbar-tagline">
        Compare prices across Pakistani stores
      </div>
    </nav>
  );
}

export default Navbar;