// The privacy page (2026-10-26). What it promises must be what the code does, so the retention times are read from the backend's
// own source here: changing one there without changing the page fails this test.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import Privacy from "../src/pages/Privacy.jsx";
import Layout from "../src/components/Layout.jsx";
import AlertForm from "../src/components/product/AlertForm.jsx";

// A plain path, not new URL(`...${path}`, import.meta.url): Vite would try to bundle every backend file for that.
const BACKEND_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend", "src");
const backend = (path) => readFileSync(join(BACKEND_SRC, path), "utf8");
const constant = (source, name) => Number(new RegExp(`export const ${name} = (\\d+);`).exec(source)?.[1]);

const renderPrivacy = () => render(<MemoryRouter><Privacy /></MemoryRouter>);

describe("Privacy page", () => {
  it("is titled, and states what is collected and what is not", async () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Privacy · ShopSavvy"));
    expect(screen.getByText(/no accounts, no cookies, no analytics and no ads/i)).toBeInTheDocument();
    for (const heading of ["What we collect, and why", "Who else sees anything", "How long it is kept", "Your choices", "Questions"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it("keeps alerts exactly as long as the backend does", () => {
    const alerts = backend("services/priceAlert.service.js");
    expect(constant(alerts, "CONFIRM_WINDOW_HOURS")).toBe(48);
    expect(constant(alerts, "CLOSED_ALERT_RETENTION_DAYS")).toBe(30);

    renderPrivacy();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toContain("An alert you have not confirmedDeleted 48 hours after you asked for it");
    expect(rows).toContain("An alert that has ended (price reached, or cancelled)Deleted 30 days after it ended");
  });

  it("says the server's log holds no search or address, as the request logger does", () => {
    const logger = backend("middleware/requestLogger.middleware.js");
    expect(logger).toContain('req.originalUrl.split("?")[0]'); // the path only: no query string
    expect(logger).not.toMatch(/req\.ip\b/);
    renderPrivacy();
    expect(screen.getByText(/but not what you searched for or your internet address/)).toBeInTheDocument();
  });

  it("is linked from every page's footer and from the alert form, where the email is asked for", () => {
    render(
      <MemoryRouter>
        <Routes><Route element={<Layout />}><Route path="*" element={<h1>Page</h1>} /></Route></Routes>
      </MemoryRouter>,
    );
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

    render(<MemoryRouter><AlertForm listing={{ _id: "a1", price: 65000, title: "Phone" }} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "How we keep your email" })).toHaveAttribute("href", "/privacy");
  });
});
