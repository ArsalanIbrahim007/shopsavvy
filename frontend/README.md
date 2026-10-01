# ShopSavvy web app

React 19 + Vite + React Router. Plain CSS with design tokens; no UI library. Talks to the backend API (see the repository
README for how to run it).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit and component tests (Vitest, jsdom)
npm run lint
npm run build      # production build in dist/
```

The API address is read from `VITE_API_URL` (default `http://localhost:5000/api`).

## Layout

| Folder | What is in it |
|---|---|
| `src/pages/` | Home, Results, Product, How it works, Not found |
| `src/components/` | Cards, offers table, filters, price chart, colour picker, header and footer |
| `src/lib/` | Pure logic with no React: filters, deal score, price history and chart geometry, colours, PTA labels, pasted-link reading, themes |
| `src/api/` | One function per backend endpoint, the HTTP client and error descriptions |
| `src/styles/tokens.css` | Every colour, size and font. Dark mode is the same names with other values |
| `public/stores/` | Each store's own logo (stores without one show a letter badge) |
| `tests/` | One test file per area; `a11y.test.jsx` runs axe's structural rules |

## Rules worth knowing

- Colours live only in `tokens.css`; a test fails if a colour literal appears anywhere else.
- Every text colour pair is checked for 4.5:1 contrast in both themes (`tests/theme.test.js`).
- Filter state, the chosen colour and the origin of a pasted link live in the address, so a view can be shared.
- Only `http(s)` store links are opened (`noopener noreferrer`); no `dangerouslySetInnerHTML`.
- Store logos are bundled files (no request to a store just to draw its logo); product photos load from the stores with no referrer sent.
