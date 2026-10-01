// HowItWorks.jsx — how ShopSavvy decides what is the same product and whether a price is real.
// Plain words first; the methods and their measured results are in a collapsed section for the
// technically curious (and for the evaluation panel). Every number below is copied from the
// project's evaluation reports (backend/src/ml/EVALUATION_REPORT.md and
// backend/src/ml/discount/EVALUATION_REPORT.md, both generated 2026-09-29): update them here
// whenever those reports are regenerated, and never round them up.

import { Link } from "react-router-dom";
import "./HowItWorks.css";

export default function HowItWorks() {
  return (
    <div className="container prose">
      <h1>How ShopSavvy checks prices</h1>
      <p className="lead muted">
        Comparing prices is easy. Knowing whether a price is real is the hard part. Here is what we do, and where we can still be wrong.
      </p>

      <section aria-labelledby="same-heading">
        <h2 id="same-heading">1. Is it the same product?</h2>
        <p>
          Stores name the same phone in different ways, and a 128 GB and a 256 GB model of the same phone are not comparable.
          We compare storage, RAM, screen size, PTA status, model codes and condition. If any of these clearly differ, the two
          listings are kept apart. For everything else, a model trained on hand-labelled pairs of listings decides.
        </p>
        <p className="muted">We would rather show one product as two than mix up two different products.</p>
      </section>

      <section aria-labelledby="discount-heading">
        <h2 id="discount-heading">2. Is the discount real?</h2>
        <p>
          A store's "was" price is only a claim. We look at the price history we have recorded for the listing, and at what the
          other stores charge for the same product today. A discount is marked <em>verified</em> only when the evidence supports it,
          and <em>unverified</em> when we cannot tell. We never count a claimed discount as a saving.
        </p>
      </section>

      <section aria-labelledby="odd-heading">
        <h2 id="odd-heading">3. Does the price look wrong?</h2>
        <p>
          Sometimes a listing has a mistake: a missing digit, a price for a different variant, a bundle. A price far out of line
          with the same product elsewhere is marked <em>unusual</em>, is never shown as the lowest price, and is never counted as a saving.
        </p>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">What we can't do</h2>
        <ul>
          <li>We only compare the stores we collect from, and prices can change after we last looked. Every offer shows when it was updated.</li>
          <li>A new product has no price history yet, so its "was" price stays unverified.</li>
          <li>Matching is not perfect. If two listings look wrong together, the store link is always one click away.</li>
        </ul>
      </section>

      <details className="technical">
        <summary>For the technically curious</summary>

        <h3>Matching listings</h3>
        <p>
          Hard rules (storage, RAM, screen size, PTA status, model codes, condition, series numbers) can veto a match. Pairs that
          survive are scored by a logistic-regression classifier over similarity features (title overlap, storage, RAM, screen,
          PTA and model-code agreement, price proximity), trained on hand-labelled pairs mined from our own listings, then grouped greedily.
        </p>
        <p>
          On 105 held-out pairs from laptops, TVs, smartwatches, tablets and headphones (never used in training), the trained
          model found 34.5% of the true matches against 24.1% for a fixed title-similarity threshold, with precision 71.4% against 58.3%
          and F1 46.5% against 34.1%. These are small test sets and the numbers move a lot per category: treat them as evidence that the model
          helps, not as a precise accuracy. It is deliberately cautious, so it misses some true matches rather than merging different products.
        </p>

        <h3>Checking discounts</h3>
        <p>
          The history rule can only judge a listing once it has at least three recorded prices, which few listings have yet. Of 251
          offers claiming a discount that had another store to compare with, it could reach a verdict on 14. A second check, an Isolation
          Forest (100 trees), compares the claimed "was" price with what the other stores charge and can score all 251. On held-out data
          with synthetic inflated claims it caught 96.8% of claims at twice the market median, but few at 1.3 times, because a
          moderately inflated claim looks like everyone else's. It flags 7.0% of real claims as unusual. The two checks answer different
          questions and run side by side; neither overrides the other.
        </p>
        <p className="muted">
          Figures from our own evaluation reports of 29 September 2026. The full method, the labelling rules and the limits are in the
          project report.
        </p>
      </details>

      <p>
        Want the numbers instead of the explanation? <Link to="/honest-prices">How we keep prices honest</Link> shows what the checks found in
        today's data and how accurate they are, including where they fall short.
      </p>

      <p><Link to="/" className="btn btn-primary">Start comparing</Link></p>
    </div>
  );
}
