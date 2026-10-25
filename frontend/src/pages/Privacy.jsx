// Privacy.jsx — what ShopSavvy collects, why, who else sees it and for how long. Every statement here describes what the code does;
// change it in the same commit as the code it describes:
//   - price alerts: backend/src/models/priceAlert.model.js, services/priceAlert.service.js (CONFIRM_WINDOW_HOURS = 48,
//     CLOSED_ALERT_RETENTION_DAYS = 30), services/notification.service.js (every email carries the cancel link)
//   - server logs: middleware/requestLogger.middleware.js (path only: no query string, no address), services/scraper.service.js
//     (the words of a search that starts a refresh from the stores)
//   - abuse limits: middleware/rateLimit.middleware.js (counts per address, in memory, 15-minute windows)
//   - this browser: lib/theme.js and lib/recentSearches.js (localStorage, never sent)

import { Link } from "react-router-dom";

import { usePageDescription, usePageTitle } from "../hooks/usePageTitle.js";
import "./HowItWorks.css";

export const PRIVACY_UPDATED = "26 October 2026";
const ISSUES_URL = "https://github.com/ArsalanIbrahim007/shopsavvy/issues";

const KEPT = [
  ["An alert you have not confirmed", "Deleted 48 hours after you asked for it"],
  ["An active alert", "Until its price is reached or you cancel it"],
  ["An alert that has ended (price reached, or cancelled)", "Deleted 30 days after it ended"],
  ["Your address, for the abuse limits", "In the server's memory only, for up to 15 minutes"],
  ["Server logs", "As long as the hosting service keeps its logs; they hold no name, email or address"],
  ["Theme and recent searches", "In your browser, until you clear its site data"],
];

export default function Privacy() {
  usePageTitle("Privacy");
  usePageDescription("What ShopSavvy collects (very little), why, who else sees it, and how long it is kept.");

  return (
    <div className="container prose">
      <h1>Privacy</h1>
      <p className="lead muted">
        ShopSavvy has no accounts, no cookies, no analytics and no ads. The only personal information it ever holds is the email
        address you give for a price alert, and only for as long as that alert needs it.
      </p>

      <section aria-labelledby="collect-heading">
        <h2 id="collect-heading">What we collect, and why</h2>
        <ul>
          <li>
            <strong>Your searches.</strong> What you type is sent to our server to find prices. The server's log records which
            page was asked for, but not what you searched for or your internet address. When a search makes us fetch newer
            prices from the stores, its words are written to the log so we can find faults; that line does not say who searched.
          </li>
          <li>
            <strong>Price alerts.</strong> If you ask to be told when a price drops, we keep your email address, the product and
            your target price. We email you once to confirm the alert, and once when the price reaches your target. Nothing else
            is sent, and your address is never shown on the site, sold or shared.
          </li>
          <li>
            <strong>Your internet (IP) address</strong> is counted in the server's memory for up to 15 minutes, so that one
            visitor or script cannot overload the site. It is never written to disk.
          </li>
          <li>
            <strong>In your browser only:</strong> your light or dark theme choice and your last few searches, so the site can
            remember them. They stay on your device and are never sent to us.
          </li>
        </ul>
      </section>

      <section aria-labelledby="others-heading">
        <h2 id="others-heading">Who else sees anything</h2>
        <ul>
          <li>
            <strong>The stores.</strong> Product pictures load from each store's own website, so that store sees your internet
            address the way any website does. When you follow a link to a store, its own privacy policy applies from then on.
          </li>
          <li>
            <strong>Our email provider</strong> carries the alert emails, so it handles your address in order to deliver them.
          </li>
          <li>
            <strong>Our hosting service</strong> runs the server and the database where alerts are kept.
          </li>
        </ul>
        <p className="muted">Nobody else. We do not sell or share any data, and the site loads no tracking or advertising code.</p>
      </section>

      <section aria-labelledby="kept-heading">
        <h2 id="kept-heading">How long it is kept</h2>
        <table className="privacy-table">
          <caption className="visually-hidden">What is kept, and for how long</caption>
          <thead>
            <tr><th scope="col">What</th><th scope="col">For how long</th></tr>
          </thead>
          <tbody>
            {KEPT.map(([what, howLong]) => (
              <tr key={what}><td>{what}</td><td>{howLong}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="choices-heading">
        <h2 id="choices-heading">Your choices</h2>
        <ul>
          <li>Every email we send has a link that cancels the alert at once. The alert, with your address, is deleted 30 days later.</li>
          <li>An alert you never confirm is deleted after 48 hours, and you will not hear from us again.</li>
          <li>You can clear what your browser keeps for this site in its settings (site data or local storage).</li>
        </ul>
      </section>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">Questions</h2>
        <p>
          ShopSavvy is a final-year project at Bahria University Karachi. Ask us anything about this page on the project's{" "}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">GitHub page</a>. That page is public, so please do not
          post your email address there.
        </p>
        <p className="small muted">Last updated {PRIVACY_UPDATED}. If what we collect changes, this page changes with it.</p>
        <p><Link to="/how-it-works">How we check prices</Link></p>
      </section>
    </div>
  );
}
