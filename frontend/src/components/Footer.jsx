import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="footer-brand">
          <div className="footer-logo">
            Shop<span>Savvy</span>
          </div>
          <p className="footer-desc">
            Compare prices. Save more. Made for Pakistani shoppers to find the
            best deals across multiple stores in one place.
          </p>
        </div>

        <div className="footer-links">
          <div className="footer-heading">Quick Links</div>
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/results?q=iphone">Search</Link></li>
            <li><Link to="/">About</Link></li>
            <li><Link to="/">Contact</Link></li>
          </ul>
        </div>

        <div className="footer-platforms">
          <div className="footer-heading">Platforms</div>
          <ul>
            <li><a href="https://priceoye.pk" target="_blank" rel="noopener noreferrer">PriceOye</a></li>
            <li><a href="https://mega.pk" target="_blank" rel="noopener noreferrer">Mega.pk</a></li>
            <li><a href="https://shophive.com" target="_blank" rel="noopener noreferrer">Shophive</a></li>
            <li><a href="https://homeshopping.pk" target="_blank" rel="noopener noreferrer">HomeShopping</a></li>
            <li><a href="https://telemart.pk" target="_blank" rel="noopener noreferrer">Telemart</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2026 ShopSavvy · Bahria University FYP · All rights reserved</p>
      </div>
    </footer>
  );
}

export default Footer;