// Extension.jsx — the browser extension's page (2026-11-27): what it does, and how to get it. Once the Chrome Web Store listing is
// live (lib/extension.js EXTENSION_STORE_URL) the button opens it; until then it downloads the .zip (extension/pack.mjs) and the
// three steps to install it are shown.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { usePageDescription, usePageTitle } from "../hooks/usePageTitle.js";
import PageHero from "../components/PageHero.jsx";
import {
  EXTENSION_STORE_URL, EXTENSION_STORES, EXTENSION_ZIP, browserName, extensionBrowser, extensionInstalled,
} from "../lib/extension.js";
import "./HowItWorks.css";
import "./Extension.css";

const BENEFITS = [
  ["Cheaper elsewhere? You'll see it", "On a product page at Daraz, PriceOye, Mega, iShopping and 20 more stores, a small panel shows the same product's price at the others, and how much the cheapest one saves."],
  ["Spot fake discounts", "\"50% off\" against a price the store never charged? The panel says when a discount looks doubtful, using the same checks as this website."],
  ["Out of your way", "It only appears on product pages we hold, folds into a small tag, and its toolbar badge shows the saving (\"-7k\") at a glance."],
];

export default function Extension() {
  usePageTitle("Browser extension");
  usePageDescription(`The free ShopSavvy extension for Chrome and Edge: see cheaper prices from ${EXTENSION_STORES} Pakistani stores on the page you're shopping, and spot fake discounts.`);
  const browser = extensionBrowser();
  const [installed, setInstalled] = useState(() => extensionInstalled());
  // the extension's mark may come a moment after the page (a store's tab reloaded, an install a minute ago)
  useEffect(() => {
    const timer = setInterval(() => setInstalled(extensionInstalled()), 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="container prose extension-page">
      <PageHero icon="extension" eyebrow="Browser extension" title="Never overpay again"
        lead={`See cheaper prices from ${EXTENSION_STORES} Pakistani stores right on the page you're shopping, and spot fake discounts. Free, for Chrome and Edge on a computer.`}>
        <div className="extension-page__cta">
          {installed ? (
            <p className="extension-page__installed" role="status">✓ The ShopSavvy extension is installed in this browser.</p>
          ) : !browser ? (
            <p className="extension-page__unsupported">It runs in Chrome and Edge on a computer. Open this page there to add it.</p>
          ) : EXTENSION_STORE_URL ? (
            <a className="btn btn-accent extension-page__button" href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
              Add to {browserName(browser)}, it's free
            </a>
          ) : (
            <a className="btn btn-accent extension-page__button" href={EXTENSION_ZIP} download>
              Download for {browserName(browser)}, it's free
            </a>
          )}
        </div>
      </PageHero>

      <section aria-labelledby="ext-what">
        <h2 id="ext-what">What it does</h2>
        <ul className="extension-page__benefits">
          {BENEFITS.map(([title, text]) => (
            <li key={title}><strong>{title}</strong><span>{text}</span></li>
          ))}
        </ul>
      </section>

      {!EXTENSION_STORE_URL && !installed && (
        <section aria-labelledby="ext-install">
          <h2 id="ext-install">Install it in three steps</h2>
          <p className="muted">While it waits for the Chrome Web Store's review, it is installed from the file above.</p>
          <ol className="extension-page__steps">
            <li>
              <strong>Download and unzip it.</strong> Press <a href={EXTENSION_ZIP} download>Download</a>, then right-click the
              file and choose <em>Extract All</em>. Keep the folder: the browser runs the extension from it.
            </li>
            <li>
              <strong>Open your extensions.</strong> Type <ChromeAddress browser={browser} /> in the address bar and switch
              on <em>Developer mode</em> (top right in Chrome, bottom left in Edge).
            </li>
            <li>
              <strong>Load it.</strong> Press <em>Load unpacked</em> and choose the folder you extracted. The ShopSavvy icon
              appears in the toolbar: pin it from the puzzle-piece menu so the saving shows at a glance.
            </li>
          </ol>
          <p>Then open a product at any store we compare, for example on PriceOye or Daraz, and the panel appears in the corner.</p>
        </section>
      )}

      <section aria-labelledby="ext-privacy">
        <h2 id="ext-privacy">Your privacy</h2>
        <p>
          On a store's product page it sends us only that page's address, product name and price, to find the same product elsewhere.
          It never reads other sites, your history or anything you type, and it has no account or tracking. See{" "}
          <Link to="/privacy#extension">Privacy</Link>.
        </p>
      </section>
    </div>
  );
}

/** chrome://extensions cannot be a link (browsers refuse it from a page), so it is shown with a copy button. */
function ChromeAddress({ browser }) {
  const address = browser === "edge" ? "edge://extensions" : "chrome://extensions";
  const [copied, setCopied] = useState(false);
  return (
    <span className="extension-page__address">
      <code>{address}</code>
      <button type="button" className="btn btn-ghost extension-page__copy"
        onClick={() => navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {})}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
