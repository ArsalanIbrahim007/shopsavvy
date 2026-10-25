import process from "node:process";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { robotsPlugin } from "./scripts/robots.js";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_API_URL and SITEMAP_URL, from the environment or a .env file, for robots.txt's Sitemap line (scripts/robots.js).
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), robotsPlugin({ VITE_API_URL: env.VITE_API_URL, SITEMAP_URL: env.SITEMAP_URL })],
    // The app's own port (the earlier frontend, which this replaced, also used 5173).
    server: { port: 5173 },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.js"],
      globals: false,
      css: false,
    },
  };
});
