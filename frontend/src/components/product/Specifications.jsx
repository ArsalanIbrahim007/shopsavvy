// Specifications.jsx — what is known about the product. When the stores' own product pages state its specifications (the server
// reads them: backend Specs engine), those are shown with their score and where they come from; otherwise what the listing's title
// says, and the note says so. Renders nothing when there is nothing to list.

import { platformName } from "../../lib/platforms.js";
import { buildPageSpecs, buildSpecs } from "../../lib/specs.js";
import "./product.css";

/** @param {{listing: object, specs?: {sheet: object, from: string[], score: {score: number, parts: object[]}|null}|null}} props */
export default function Specifications({ listing, specs = null }) {
  const pageRows = buildPageSpecs(specs?.sheet);
  const fromPages = pageRows.length > 0;
  const rows = fromPages ? pageRows : buildSpecs(listing);
  if (rows.length === 0) return null;
  const sources = (specs?.from ?? []).map(platformName).join(", ");

  return (
    <section className="specs card" aria-labelledby="specs-heading">
      <h2 id="specs-heading">Specifications</h2>
      {fromPages && specs.score && (
        <p className="specs__score">
          Specs score <strong>{specs.score.score}</strong>/100 <span className="small muted">from {specs.score.parts.length} specs, rated for its category</span>
        </p>
      )}
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        {fromPages
          ? `From the stores' own product pages${sources ? ` (${sources})` : ""}; RAM and storage from the listing's title.`
          : "Derived from the product title published by the store."}
      </p>
    </section>
  );
}
