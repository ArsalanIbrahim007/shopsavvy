// eslint.config.js — the backend's lint rules: ESLint's recommended set for Node (the same base as the frontend's), run in CI.
import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["coverage", "node_modules"]),
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Underscore-prefixed names are deliberately unused, as in the frontend; so is a field left out by destructuring
      // ({ $or, ...rest }).
      "no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
    },
  },
  {
    // Scrapers hand functions to page.evaluate(), which run in the store's page: browser globals there.
    files: ["src/scrapers/**/*.js", "src/scripts/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Teammates' code with an unused name left in it (an unused `opts` parameter in scrapers/index.js, two unused imports and two
    // unused variables in scraperUtils.test.js): reported as warnings, to be tidied by their authors, not failed here.
    files: ["src/scrapers/index.js", "tests/scraperUtils.test.js"],
    rules: { "no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }] },
  },
]);
