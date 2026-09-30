import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The old frontend keeps 5173 so the two can run side by side for comparison.
  server: { port: 5174 },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: false,
    css: false,
  },
});
