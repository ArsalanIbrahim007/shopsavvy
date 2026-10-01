// Specifications.jsx — what the listing states about the product. Most stores publish specifications only
// inside the title, so the note says these are derived from it. Renders nothing when there is nothing to list.

import { buildSpecs } from "../../lib/specs.js";
import "./product.css";

export default function Specifications({ listing }) {
  const rows = buildSpecs(listing);
  if (rows.length === 0) return null;

  return (
    <section className="specs card" aria-labelledby="specs-heading">
      <h2 id="specs-heading">Specifications</h2>
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Derived from the product title published by the store.</p>
    </section>
  );
}
