// vitest.config.js — `npm run coverage` measures how much of the API's code the tests run.
//
// Measured: the application under src/. Left out: src/scripts/ (one-off command-line tools: evaluations, diagnostics, data
// fixes, the load test, which are run by hand and checked by their own output, not by unit tests) and src/app.js (start-up
// only: it connects to MongoDB and listens; createApp.js, which the tests do run, builds the application).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/scripts/**", "src/app.js"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
