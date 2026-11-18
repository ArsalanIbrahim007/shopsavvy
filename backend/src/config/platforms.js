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
export const VISIBLE_PLATFORMS_FILTER = { platform: { $nin: DISABLED_PLATFORMS }, supersededAt: null, notInCatalogueSince: null };
