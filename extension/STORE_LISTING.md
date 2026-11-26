# Chrome Web Store / Edge Add-ons submission (2026-11-27)

Everything the store forms ask for, ready to paste. The package is `extension/dist/shopsavvy-extension-1.1.0.zip`
(`node extension/pack.mjs` builds it, and the same file for the website's download).

## Before you start (you do these yourself)

- **Chrome Web Store**: sign in at https://chrome.google.com/webstore/devconsole with the Google account that should own it,
  pay the one-time USD 5 developer fee, and verify the account's email.
- **Edge Add-ons** (free): sign in at https://partner.microsoft.com/dashboard/microsoftedge with a Microsoft account and
  register as an Edge developer.
- **Screenshots** (at least 1, up to 5; 1280 x 800 or 640 x 400, PNG or JPG): take them in your Chrome with the extension
  loaded, e.g. the panel on a PriceOye phone page, the toolbar popup open, the panel on a Daraz page with a cheaper store.
- **Small promo tile** (440 x 280, optional for Chrome).

## Store listing tab

**Name**: ShopSavvy: compare prices in Pakistan

**Summary / short description** (132 characters max):
> Never overpay again: see cheaper prices from 24 Pakistani stores on the page you're shopping, and spot fake discounts.

**Category**: Shopping

**Language**: English

**Description**:

> Never overpay again.
>
> Shopping for a phone, laptop, TV or appliance on Daraz, PriceOye, Mega, iShopping or another Pakistani store? ShopSavvy
> checks the same product at 24 stores while you look at it.
>
> - **Cheaper elsewhere? You'll see it.** A small panel in the corner of the product page shows the same product's price at
>   the other stores, the cheapest first, and how much you save.
> - **Spot fake discounts.** "50% off" against a price the store never charged? ShopSavvy tells you when a discount looks
>   doubtful, and when a price looks like a listing error.
> - **At a glance.** The toolbar badge shows the saving ("-7k") or a tick when this store is already the cheapest.
> - **Out of your way.** It only appears on product pages it knows, and folds into a small tag.
>
> Stores: Daraz, PriceOye, Mega, iShopping, Shophive, Paklap, EezePC, W11Stop, Xcessories Hub, Mi Store, MyMart, Al-Fatah,
> LED Shop, Techroid, Subhan Electronics, Jalal Electronics, Japan Electronics, Zero Lifestyle, Audionic, Ronin, Baseus,
> Infinix, AlfaMall and DigiMall, plus Qeemat.
>
> Free, no account, no ads, no tracking. ShopSavvy is a final-year project at Bahria University Karachi; the full comparison is
> at https://shopsavvy.pages.dev

**Official URL / homepage**: https://shopsavvy.pages.dev/extension

**Support URL**: https://github.com/ArsalanIbrahim007/shopsavvy/issues

## Privacy practices tab

**Single purpose**:
> On a Pakistani store's product page, show the same product's price at other Pakistani stores and whether the store's
> discount is real.

**Permission justifications**:

- `storage`: remembers the user's two settings (show the panel or not; the server address) and the product found in each open
  tab, so the toolbar popup can show it. Kept in the browser.
- `activeTab`: the toolbar popup reads which product the current tab shows, to list its prices at other stores.
- Host permission `https://cranium-espresso-sway.ngrok-free.dev/*`: ShopSavvy's own server, which answers the price
  comparison. (`localhost:5000` is the developer's copy of the same server.)
- Content scripts on the 24 stores (and Qeemat, Amazon): read the product's name, price and address on a product page, and
  draw the comparison panel there. On shopsavvy.pages.dev, `site.js` only marks the page so the website does not invite the
  user to add the extension again.

**Remote code**: No, I am not using remote code.

**Data usage**: tick **Website content** (the product page's name, price and address are sent to ShopSavvy's server to find
the same product). Nothing else is collected.

Certify all three: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used
to determine creditworthiness or for lending.

**Privacy policy URL**: https://shopsavvy.pages.dev/privacy#extension

## After approval

Put the store page's address in Cloudflare Pages as `VITE_EXTENSION_STORE_URL` (Settings -> Variables, Production) and
redeploy: the site's "Add to Chrome" buttons then open the store instead of the download page.
