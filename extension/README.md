# ShopSavvy browser extension

On a product page at one of 24 Pakistani stores (or on Qeemat), the extension shows the same product's price at the other stores, whether a
cheaper one exists (and how much it saves), and what ShopSavvy's checks say about the store's discount. It works in Chrome and
Edge (Manifest V3).

Started by Abuzar (`abuzar/Z4-extension`: the first manifest, popup layout and icons); finished and tested on 2026-11-07.

## Install (for a demonstration)

1. Open `chrome://extensions` (or `edge://extensions`), switch on **Developer mode**, press **Load unpacked** and choose this
   `extension/` folder.
2. Open a product page, for example `https://www.ishopping.pk/tcl-55-qled-tv-p79k-price-in-pakistan`.

It asks the deployed API (`https://shopsavvy-api.duckdns.org`). For development against your own copy, start it
(`cd backend && npm run dev`) and set `http://localhost:5000` in the popup's *Settings*.

After changing a file: press the extension's reload button on `chrome://extensions`, then reload the store's tab.

## What it shows

- **A panel** in the corner of the store's page, only when another store sells the product: "PKR 143,999 at Shophive: save
  PKR 6,521" with a link to that store and to the full comparison on ShopSavvy, or "This is the lowest price we found". Below
  it, the warnings that apply: a discount that looks fake or doubtful, a price that looks like a listing error, the lowest
  price we have recorded, and "check it is the same model" when the page was matched by name and price rather than by address.
- **The toolbar badge**: the saving ("-7k", "-1.5L") when another store is cheaper, a tick when this page is the cheapest.
- **The popup**: this page's price, the other stores cheapest first (with old, unusual, used or out-of-stock prices marked),
  and the settings (the API's address, and whether to show the panel).

## How it works

| File | Does |
|---|---|
| `reader.js` | Reads the product from the page: schema.org Product data, else Open Graph product tags, else a Magento or WooCommerce product page. Not a product page: nothing is sent. |
| `content.js` | Runs on the stores' pages: reads, asks the service worker, draws the panel (in a closed shadow DOM, so neither side's styles leak). |
| `background.js` | The service worker: calls `GET /api/listings/match?url=&title=&price=` (from here, not the page, so CORS does not apply), keeps each tab's answer in `chrome.storage.session`, sets the badge. |
| `popup.*` | The toolbar popup and the settings. |
| `stores.js`, `format.js` | The stores and their names; the panel's words. |

The API finds the page by its address when we store it, by its title at the same store, or, for a page we do not store
(Daraz, which is not scraped), by grouping its title and price with our stored products.

Nothing from the API is written as HTML (only `textContent`), and only `http(s)` addresses become links.
Permissions: `storage`, `activeTab`, the stores' pages (to read them) and the local API. Another API address (the deployed
one) is asked for when it is saved in the settings.

## Checks

- `cd frontend && npx vitest run tests/extension.test.js`: the reader on the shapes of the real stores' pages, the store list
  against the manifest and the API, the panel's words.
- `npx --prefix ../backend eslint .` here: lint.
- Checked live on 2026-11-07 in Edge with the extension loaded: iShopping (Shophive PKR 6,521 cheaper, badge "-7k"), Mega
  (eezepc PKR 2,009 cheaper), Shophive (the lowest), Daraz (placed among 10 stores' offers by title and price, the lowest),
  a product no other store sells and a category page (no panel).

## When the site is deployed

Set the deployed API's address in the popup's settings (the extension asks for permission to reach it), or change
`DEFAULT_API` in `background.js` and add the address to `host_permissions` in `manifest.json` before packing it.

## On Qeemat and Amazon (2026-11-08)

- **Qeemat** compares prices too. Its product page states a name and a price in rupees, so the API places it among our products, as
  it does a Daraz page, and the panel shows our stores' prices beside Qeemat's.
- **Amazon** (`.com`, `.co.uk`, `.ae`, `.sa`, `.in`, `.de`, `.ca`, `.com.au`) prices are in another currency, so nothing is compared.
  The product's name (`#productTitle`, cut to the model and its storage) is searched for, and the panel says "In Pakistan from
  PKR ... at ...", with a reminder to check it is the same model.
- **AlfaMall and DigiMall** pages are drawn by JavaScript with no data for search engines: the reader takes their `h1.product-title`
  and `.main-price`, and the content script looks again for a few seconds while the page draws.
