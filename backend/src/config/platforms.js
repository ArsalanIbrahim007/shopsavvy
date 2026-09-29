// Platforms that are switched off. Their scrapers are disabled (see
// src/scrapers/index.js) and their stored listings are hidden from every
// query that feeds the UI, so stale prices from a source we no longer refresh
// never appear. Nothing is deleted: remove a name here (and re-enable the
// scraper) and its listings reappear.
export const DISABLED_PLATFORMS = ["daraz"];

// Mongo filter fragment that excludes them.
export const VISIBLE_PLATFORMS_FILTER = { platform: { $nin: DISABLED_PLATFORMS } };
