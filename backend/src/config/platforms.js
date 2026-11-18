// Platforms that are switched off. Their scrapers are disabled (see
// src/scrapers/index.js) and their stored listings are hidden from every
// query that feeds the UI, so stale prices from a source we no longer refresh
// never appear. Nothing is deleted: remove a name here (and re-enable the
// scraper) and its listings reappear.
//
// daraz     robots.txt disallows the catalogue search.
// telemart  switched off 2026-10-25: telemart.pk now redirects to telex.pk, whose terms forbid "any robot, spider, scraping, data
//           gathering and extraction tools, automatic devices or processes", and whose agent guide (/agents.md) requires signed
//           requests (Shopify's Web Bot Auth) from servers; it had answered our searches with 429 for weeks anyway.
export const DISABLED_PLATFORMS = ["daraz", "telemart"];

// Mongo filter fragment that excludes them; listings retired because the same store lists the product again under its variants' own
// addresses (services/supersededListings.service.js); and listings the store no longer has (catalogueRefresh.service.js: gone from its
// whole catalogue, or a marketplace seller's listing taken down), whose "View deal" led nowhere. A missing field counts as null, so
// every other listing stays visible; a listing found again is shown again (scraper.service.js toListingDoc clears both).
//
// And listings not checked for HIDE_AFTER_DAYS (2026-11-18): a price that old is likely gone from the store (a seller's deleted
// listing at a store we only search). Out of date at 7 days (offerFreshness.service.js: labelled, ranked last), hidden at 15; a
// search that finds it again shows it again. The cut-off is worked out each time the filter is read (a getter: `{ ...filter }`
// and Mongo both read it then), so a long-running API never keeps the cut-off of its start.
export const HIDE_AFTER_DAYS = 15;
export const VISIBLE_PLATFORMS_FILTER = {
  platform: { $nin: DISABLED_PLATFORMS },
  supersededAt: null,
  notInCatalogueSince: null,
  get lastScrapedAt() {
    return { $gte: new Date(Date.now() - HIDE_AFTER_DAYS * 24 * 3600 * 1000) };
  },
};
