// ErrorState.jsx — what a shopper sees when a request fails: what happened in plain words,
// the reference id to quote, and a retry when trying again can help. The wording comes
// from describeError, so every page says the same thing for the same failure.

import { describeError } from "../api/errors.js";

export default function ErrorState({ error, onRetry }) {
  const info = describeError(error);

  return (
    <div className="card" role="alert" style={{ padding: "var(--space-5)", maxWidth: 560 }}>
      <h2 style={{ fontSize: "1.125rem" }}>{info.title}</h2>
      <p className="muted" style={{ marginTop: "var(--space-2)" }}>{info.message}</p>
      {info.reference && <p className="muted small" style={{ marginTop: "var(--space-2)" }}>{info.reference}</p>}
      {info.canRetry && onRetry && (
        <button className="btn btn-primary" type="button" onClick={onRetry} style={{ marginTop: "var(--space-4)" }}>
          Try again
        </button>
      )}
    </div>
  );
}
