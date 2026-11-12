export const MAX_PAGE_SIZE = 200;
// Without a `limit`, one page of this size: returning the whole collection loaded all 77,000 listings (83 MB) in one call, from an
// endpoint listed in the API docs and allowed 240 times per 15 minutes (audit, 2026-11-12). No page of the site asks it unpaged.
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Reads pagination from a query string: `limit` (clamped to MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE when not given) and `page` (1-based),
 * turned into a skip.
 */
export function parsePagination(query = {}) {
  const given = query.limit === undefined || query.limit === "" ? DEFAULT_PAGE_SIZE : query.limit;
  const limit = Math.min(Math.max(Math.floor(Number(given)) || 0, 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.floor(Number(query.page)) || 1, 1);

  return { limit, page, skip: (page - 1) * limit };
}
