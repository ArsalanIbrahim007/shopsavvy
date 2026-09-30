// ErrorBoundary.jsx — if a component throws while rendering, show a plain message instead
// of a blank page. It catches render errors only; failed requests are handled where they
// are made (see ErrorState).

import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // The console is the only place to look: there is no error-reporting service.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="container" style={{ padding: "var(--space-7) var(--gutter)" }}>
        <div className="card" role="alert" style={{ padding: "var(--space-6)", maxWidth: 560 }}>
          <h2>Something went wrong on this page</h2>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            It's on our side. Reloading usually fixes it, and your search isn't lost.
          </p>
          <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-3)" }}>
            <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Reload page</button>
            <a className="btn btn-ghost" href="/">Go to the home page</a>
          </div>
        </div>
      </div>
    );
  }
}
