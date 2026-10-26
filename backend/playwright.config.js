// playwright.config.js — end-to-end tests (`npm run e2e`): a real browser using the real built site, talking to the real API on
// its own database (see e2e/). Not the unit tests: those are Vitest (`npm test`).
//
// Before the tests: the API starts on port 5056 after e2e/seed.js has filled the e2e database, and the frontend is built against
// that API and served on port 4174 (vite preview). Nothing reaches a store: the seeded listings are fresh, so no search scrapes,
// and the nightly scrape is off.

import { defineConfig, devices } from "@playwright/test";

import { E2E_MONGO_URI } from "./e2e/fixtures.js";

const API_PORT = 5056;
const SITE_PORT = 4174;
export const API = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.js",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: { baseURL: `http://localhost:${SITE_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/seed.js && node src/app.js",
      url: `${API}/api/health`,
      // Set here, so they win over the backend's .env (dotenv does not replace a variable that is already set).
      env: {
        MONGO_URI: E2E_MONGO_URI,
        PORT: String(API_PORT),
        SCHEDULED_SCRAPING: "false",
        ALERT_AUTO_CONFIRM: "false",
        PUBLIC_SITE_URL: `http://localhost:${SITE_PORT}`,
        SMTP_HOST: "",
      },
      timeout: 120 * 1000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      // Its own folder, so the site's normal build (dist/) is left as it was.
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${SITE_PORT} --strictPort`,
      cwd: "../frontend",
      url: `http://localhost:${SITE_PORT}`,
      env: { VITE_API_URL: `${API}/api` },
      timeout: 120 * 1000,
      reuseExistingServer: false,
    },
  ],
});
