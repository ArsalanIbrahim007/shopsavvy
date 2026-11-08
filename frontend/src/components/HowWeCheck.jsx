// HowWeCheck.jsx — the home page's "How we check prices", shown rather than told: three small pictures, each of one check doing its job,
// drawn when they come into view. Matched: two listings with the same specs pair up and a 128 GB one is turned away. Checked: a
// store's "was" price floats far above every price we recorded, and is struck. Flagged: one store's price sits far from the rest
// and is ringed. Each has a title and one short line; the pictures are decorative.

import { Link } from "react-router-dom";

import { useInView } from "../hooks/useCountUp.js";
import "./HowWeCheck.css";

function Matched() {
  return (
    <div className="check-pic check-pic--matched" aria-hidden="true">
      <div className="spec-row"><span>256 GB</span><span>8 GB</span><span>PTA</span></div>
      <div className="spec-join">=</div>
      <div className="spec-row"><span>256 GB</span><span>8 GB</span><span>PTA</span></div>
      <div className="spec-row spec-row--out"><span className="spec-bad">128 GB</span><span>8 GB</span><span>PTA</span><b>✕</b></div>
    </div>
  );
}

function Checked() {
  return (
    <svg className="check-pic check-pic--checked" viewBox="0 0 240 120" aria-hidden="true">
      <text className="pic-label" x="8" y="22">"was" 89,999</text>
      <line className="pic-was" x1="8" x2="232" y1="34" y2="34" />
      <line className="pic-strike" x1="8" x2="112" y1="18" y2="18" />
      <path className="pic-gap" d="M200 40v40" />
      <polyline className="pic-history" points="8,96 40,92 72,94 104,88 136,90 168,86 200,88 232,84" pathLength="1" />
      <text className="pic-label pic-label--soft" x="8" y="114">every price we recorded</text>
    </svg>
  );
}

function Flagged() {
  const dots = [138, 158, 172, 190, 212];
  return (
    <svg className="check-pic check-pic--flagged" viewBox="0 0 240 120" aria-hidden="true">
      <line className="pic-axis" x1="8" x2="232" y1="64" y2="64" />
      {dots.map((x, i) => <circle key={x} className="pic-dot" cx={x} cy="64" r="6" style={{ animationDelay: `${150 + i * 70}ms` }} />)}
      <circle className="pic-odd" cx="36" cy="64" r="6" />
      <circle className="pic-ring" cx="36" cy="64" r="14" />
      <text className="pic-label pic-label--bad" x="36" y="100" textAnchor="middle">unusual</text>
      <text className="pic-label pic-label--soft" x="175" y="100" textAnchor="middle">other stores</text>
    </svg>
  );
}

const CHECKS = [
  { title: "Matched", line: "Same model, same specs, or no comparison.", Picture: Matched },
  { title: "Checked", line: "A \"was\" price must match its history.", Picture: Checked },
  { title: "Flagged", line: "Prices far out of line never count.", Picture: Flagged },
];

export default function HowWeCheck() {
  const [ref, inView] = useInView();
  return (
    <section className="home-section container" aria-labelledby="how-heading">
      <div className="home-section__head">
        <h2 id="how-heading">How we check prices</h2>
        <span className="home-section__links">
          <Link to="/how-it-works">Read the details</Link>
          <Link to="/honest-prices">See the numbers</Link>
        </span>
      </div>
      <ol ref={ref} className={inView ? "checks is-visible" : "checks"}>
        {CHECKS.map(({ title, line, Picture }) => (
          <li key={title} className="check card">
            <Picture />
            <h3>{title}</h3>
            <p className="muted">{line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
