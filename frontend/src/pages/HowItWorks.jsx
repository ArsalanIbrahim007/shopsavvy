// HowItWorks.jsx — how ShopSavvy decides what is the same product and whether a price is real.
// Three steps, each with the small picture the home page uses (components/HowWeCheck.jsx) and two or three sentences; then what we
// cannot do; the methods and their measured results are in a collapsed section for the technically curious (and for the evaluation
// panel). Every number below is copied from the project's evaluation reports (backend/src/ml/EVALUATION_REPORT.md and
// backend/src/ml/discount/EVALUATION_REPORT.md, both generated 2026-09-29): update them here whenever those reports are regenerated,
// and never round them up.

import { Link } from "react-router-dom";

import { Checked, Flagged, Matched } from "../components/HowWeCheck.jsx";
import { useInView } from "../hooks/useCountUp.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import "../components/HowWeCheck.css";
import "./HowItWorks.css";

const STEPS = [
  {
    id: "same", title: "Is it the same product?", Picture: Matched, rule: "When unsure, we keep them apart.",
    text: "Stores name one phone many ways. We compare storage, RAM, screen size, PTA status, model codes and condition; if any clearly differ, the listings stay apart. A model trained on hand-labelled pairs decides the rest.",
  },
  {
    id: "discount", title: "Is the discount real?", Picture: Checked, rule: "A claimed discount is never counted as a saving.",
    text: "A \"was\" price is only a claim. We check it against the price history we recorded and what other stores charge today: verified when the evidence supports it, unverified when we cannot tell.",
  },
  {
    id: "odd", title: "Does the price look wrong?", Picture: Flagged, rule: "Never the lowest price, never a saving.",
    text: "A missing digit, a different variant, a bundle: a price far out of line with the same product elsewhere is marked unusual.",
  },
];

const LIMITS = [
  { title: "Only the stores we collect from", text: "Prices can change after we look. Every offer shows when it was updated." },
  { title: "New products have no history", text: "So their \"was\" price stays unverified until they do." },
  { title: "Matching is not perfect", text: "If two listings look wrong together, the store's own page is one click away." },
];

function Step({ step, index }) {
  const [ref, inView] = useInView();
  const { Picture } = step;
  return (
    <section ref={ref} className={inView ? "how-step is-visible" : "how-step"} aria-labelledby={`${step.id}-heading`}>
      <div className="how-step__pic"><Picture /></div>
      <div className="how-step__text">
        <p className="how-step__num price" aria-hidden="true">0{index + 1}</p>
        <h2 id={`${step.id}-heading`}>{step.title}</h2>
        <p className="muted">{step.text}</p>
        <p className="how-step__rule small">{step.rule}</p>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  usePageTitle("How we check prices");
  return (
    <div className="container prose how">
      <header className="how__head">
        <h1>How ShopSavvy checks prices</h1>
        <p className="lead muted">Comparing prices is easy. Knowing whether a price is real is the hard part.</p>
      </header>

      <div className="how__steps">
        {STEPS.map((step, i) => <Step key={step.id} step={step} index={i} />)}
      </div>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">What we can't do</h2>
        <ul className="how-limits">
          {LIMITS.map((limit) => (
            <li key={limit.title} className="card">
              <strong>{limit.title}</strong>
              <span className="muted small">{limit.text}</span>
            </li>
          ))}
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

      <div className="how__next">
        <Link to="/" className="btn btn-accent">Start comparing</Link>
        <Link to="/honest-prices">See how accurate the checks are →</Link>
      </div>
    </div>
  );
}
