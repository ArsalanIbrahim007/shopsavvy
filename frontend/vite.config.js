import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The app's own port (the earlier frontend, which this replaced, also used 5173).
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: false,
    css: false,
  },
});
