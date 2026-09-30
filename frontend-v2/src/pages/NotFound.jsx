import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="card" style={{ padding: "var(--space-6)", maxWidth: 560 }}>
        <h1 style={{ fontSize: "1.5rem" }}>That page doesn't exist</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          The link may be old or mistyped. Search for the product instead.
        </p>
        <p style={{ marginTop: "var(--space-4)" }}>
          <Link className="btn btn-primary" to="/">Go to the home page</Link>
        </p>
      </div>
    </div>
  );
}
