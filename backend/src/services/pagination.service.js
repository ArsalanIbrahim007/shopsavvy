export const MAX_PAGE_SIZE = 200;

/**
 * Reads opt-in pagination from a query string.
 *
 * Returns null when no `limit` was supplied, so existing callers keep getting
 * the full collection. With a limit, the page size is clamped to
 * MAX_PAGE_SIZE and `page` (1-based) is turned into a skip.
 */
export function parsePagination(query = {}) {
  if (query.limit === undefined || query.limit === "") return null;

  const limit = Math.min(Math.max(Math.floor(Number(query.limit)) || 0, 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.floor(Number(query.page)) || 1, 1);

  return { limit, page, skip: (page - 1) * limit };
}
