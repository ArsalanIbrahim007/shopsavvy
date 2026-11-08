// Help.jsx — the user manual (the Gantt chart's phase 6): how to use each part of ShopSavvy, in the words the site itself uses.
// Keep it in step with the pages it describes: the labels come from lib/verdicts.js (deal and discount verdicts), lib/filters.js (the
// sort orders), components/results/OfferTable.jsx (the deal score's parts), pages/Product.jsx (the product page's sections),
// components/product/AlertForm.jsx and extension/README.md.

import { Link } from "react-router-dom";

import { usePageDescription, usePageTitle } from "../hooks/usePageTitle.js";
import "./HowItWorks.css";
import "./Help.css";

const CONTENTS = [
  ["search", "Find a product"],
  ["results", "Compare the stores"],
  ["product", "A product's page"],
  ["discounts", "Is the discount real?"],
  ["wait", "Buy now or wait?"],
  ["alerts", "Price alerts"],
  ["drops", "Recent price drops"],
  ["extension", "The browser extension"],
  ["trust", "How far to trust it"],
  ["problems", "When something looks wrong"],
];

const DISCOUNT_VERDICTS = [
  ["Verified discount", "good", "The store's own price history shows it really sold at the \"was\" price."],
  ["Likely genuine", "good", "Its own history mostly supports the claim."],
  ["Unverified discount", "neutral", "We have too little of the store's own history to clear it, and nothing else shows it inflated."],
  ["Suspicious discount", "caution", "The \"was\" price is higher than the history supports, or above what products with these specs usually cost."],
  ["Fake discount", "bad", "The history strongly contradicts it: the store never sold at that \"was\" price while we watched."],
];

export default function Help() {
  usePageTitle("How to use ShopSavvy");
  usePageDescription("The ShopSavvy user guide: searching, comparing stores, reading the deal score and discount verdicts, price alerts, price drops and the browser extension.");

  return (
    <div className="container prose help">
      <div>
        <h1>How to use ShopSavvy</h1>
        <p className="lead muted">
          ShopSavvy compares the prices of electronics at Pakistani online stores, checks whether their discounts are real, and tells you
          when a price falls. It is free, and needs no account.
        </p>
      </div>

      <nav className="help-contents card" aria-label="On this page">
        <ol>
          {CONTENTS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}
        </ol>
      </nav>

      <section id="search" aria-labelledby="search-h">
        <h2 id="search-h">1. Find a product</h2>
        <ul>
          <li>Type what you want in the search box at the top of any page: a model is best (<em>Galaxy A17 256GB</em>, <em>Haier 1.5 ton
            inverter</em>), but a kind of product works too (<em>55 inch TV</em>). Suggestions appear as you type.</li>
          <li>Or open a category from the home page (phones, laptops, TVs, air conditioners and more) to browse without searching.</li>
          <li>Your last few searches are remembered in your browser only, so you can repeat one with a tap.</li>
        </ul>
      </section>

      <section id="results" aria-labelledby="results-h">
        <h2 id="results-h">2. Compare the stores</h2>
        <p>Results are grouped by product: every store's offer for the same model sits in one table, so you compare like with like.</p>
        <ul>
          <li><strong>The cheapest store</strong> is marked in each table. A price we have not checked for two weeks is labelled and is
            never shown as the lowest.</li>
          <li><strong>Deal score</strong> (out of 100) weighs more than price: price against the other stores and the fair price for its
            specs (60), store trust and the product's rating (20), how recently we checked the price (10) and whether it is in stock (10).
            Hover or tap a score to see its parts.</li>
          <li><strong>Sort</strong> by Best deal, Lowest price, Best deal score or Highest verified discount, and use the
            <strong> filters</strong> (brand, storage, RAM, screen size, colour, condition, PTA status) to narrow the list.</li>
          <li>Used, refurbished and open-box offers are listed separately, never mixed with new ones.</li>
          <li>For phones and tablets, an offer is labelled when it does not say it is PTA approved, so you can tell which work on a
            Pakistani SIM.</li>
        </ul>
      </section>

      <section id="product" aria-labelledby="product-h">
        <h2 id="product-h">3. A product's page</h2>
        <p>Open any offer to see everything about that product:</p>
        <ul>
          <li><strong>Across stores</strong>: every store's price, cheapest first, with a link to buy at the store. ShopSavvy does not
            sell anything itself.</li>
          <li><strong>Fair price for these specs</strong>: what our trained price model expects a product with these specifications to
            cost, and how far this price is above or below it.</li>
          <li><strong>Wait or buy?</strong> and <strong>Higher chance of a price drop this week</strong>: see <a href="#wait">Buy now or wait?</a></li>
          <li><strong>Deal verdict</strong>: what our checks say about this store's price and discount (next section).</li>
          <li><strong>Price history</strong>: every price we have recorded at each store; a dashed line marks the "was" price a store
            claims.</li>
          <li><strong>Price alert</strong> and <strong>Specifications</strong>. <strong>Share</strong> copies a link that shows the
            product's picture and price when pasted into WhatsApp or other apps.</li>
        </ul>
      </section>

      <section id="discounts" aria-labelledby="discounts-h">
        <h2 id="discounts-h">4. Is the discount real?</h2>
        <p>
          Stores often show a crossed-out "was" price. ShopSavvy checks it against the prices the store actually charged, and labels it:
        </p>
        <ul className="help-verdicts">
          {DISCOUNT_VERDICTS.map(([label, tone, meaning]) => (
            <li key={label}><span className={`badge badge-${tone}`}>{label}</span> {meaning}</li>
          ))}
        </ul>
        <p className="muted">
          Each verdict comes with its reason in words. "Above market" means the "was" price is far above what other stores charge today.
        </p>
      </section>

      <section id="wait" aria-labelledby="wait-h">
        <h2 id="wait-h">5. Buy now or wait?</h2>
        <ul>
          <li><strong>Wait or buy?</strong> shows where today's price sits among the prices we have recorded, and how prices like it have
            moved. It is not a forecast and says so.</li>
          <li><strong>Higher chance of a price drop this week</strong> appears only when our trained forecast ranks a store's price
            among those most likely to fall 3% or more within a week. It is a hint, not a promise: it says how often such prices did fall
            in our tests.</li>
          <li>The product's verdict (Buy now, Good deal, Fair price, Wait, Overpriced) sums these up; "Not enough history" means we have
            not watched the price long enough to say.</li>
        </ul>
      </section>

      <section id="alerts" aria-labelledby="alerts-h">
        <h2 id="alerts-h">6. Price alerts</h2>
        <ol>
          <li>On a product's page, under <strong>Price alert</strong>, enter your email and the price you would pay.</li>
          <li>We email you a link to confirm the alert. Open it within 48 hours, or the alert is deleted. (Check your spam folder if it
            does not arrive.)</li>
          <li>When the price at that store falls to your price or lower, we email you once. Every email has a link to cancel.</li>
        </ol>
        <p className="muted">No account, no newsletter. <Link to="/privacy">How we keep your email</Link></p>
      </section>

      <section id="drops" aria-labelledby="drops-h">
        <h2 id="drops-h">7. Recent price drops</h2>
        <p>
          <Link to="/drops">Price drops</Link> lists offers whose price came down since we last checked that store; narrow it to one
          category. The "was" price there is our own record of the store's previous price, not the store's claim.
        </p>
      </section>

      <section id="extension" aria-labelledby="extension-h">
        <h2 id="extension-h">8. The browser extension</h2>
        <p>
          On a product page at a store we track (or on Qeemat), the ShopSavvy extension for Chrome and Edge shows the same product's price
          at the other stores, how much a cheaper one saves, and what our checks say about the store's discount.
        </p>
        <ul>
          <li><strong>The panel</strong> in the corner of the store's page appears only when another store sells the product.</li>
          <li><strong>The toolbar badge</strong> shows the saving ("-7k") when another store is cheaper, or a tick when this one is the
            cheapest.</li>
          <li><strong>The popup</strong> lists every store's price, cheapest first, and holds the settings.</li>
        </ul>
        <p className="muted">
          To install it before it is in the Chrome Web Store: open <code>chrome://extensions</code>, switch on Developer mode, press
          Load unpacked and choose the <code>extension</code> folder of the project.
        </p>
      </section>

      <section id="trust" aria-labelledby="trust-h">
        <h2 id="trust-h">9. How far to trust it</h2>
        <p>
          ShopSavvy shows how accurate it is, with the numbers: how often it groups the right offers together, how its discount checks
          and price model were tested, and how fresh its prices are. See <Link to="/honest-prices">How accurate we are</Link> and{" "}
          <Link to="/how-it-works">How we check prices</Link>. Always confirm the final price on the store's own page before you buy.
        </p>
      </section>

      <section id="problems" aria-labelledby="problems-h">
        <h2 id="problems-h">10. When something looks wrong</h2>
        <dl className="help-faq">
          <dt>The store shows a different price.</dt>
          <dd>Stores change prices during the day; we check most of them every night. Each offer says when we last checked it.</dd>
          <dt>I can't find a product.</dt>
          <dd>Try the model name without extra words, or fewer words. A search also asks the stores for newer prices, so trying again a
            minute later can find more.</dd>
          <dt>Two different products are in one table, or one product is split in two.</dt>
          <dd>Our matching is right about 99 times in 100 when it joins offers, but not perfect. Check the model number on the store's
            page, and tell us (below).</dd>
          <dt>The alert email never came.</dt>
          <dd>Look in your spam folder, and make sure the address was typed correctly. You can simply set the alert again.</dd>
          <dt>The page shows an error.</dt>
          <dd>Press Try again. If it keeps happening, the error's reference code helps us find the cause.</dd>
        </dl>
        <p>
          Something else? <a href="https://github.com/ArsalanIbrahim007/shopsavvy/issues" target="_blank" rel="noopener noreferrer">Report
          it on GitHub</a>, or <Link to="/try">help us test ShopSavvy</Link> in ten minutes.
        </p>
      </section>
    </div>
  );
}
