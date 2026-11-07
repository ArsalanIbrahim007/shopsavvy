// eslint.config.js — the extension's lint rules, run with the backend's ESLint: `npx --prefix ../backend eslint .` from here.
// Plain browser scripts (no modules) sharing three globals: ShopSavvyReader, ShopSavvyStores, ShopSavvyFormat.
import js from "../backend/node_modules/@eslint/js/src/index.js";
import globals from "../backend/node_modules/globals/index.js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
        ShopSavvyReader: "readonly",
        ShopSavvyStores: "readonly",
        ShopSavvyFormat: "readonly",
      },
    },
  },
];
