/**
 * Express parses `?colour[$ne]=x` into an object, and a filter value that is an
 * object is interpreted by MongoDB as an operator. Query-string values that
 * become part of a database filter are therefore accepted only as plain
 * strings; anything else is treated as not supplied.
 */
export function textParam(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A positive finite number from a query-string value, or undefined. */
export function numberParam(value) {
  const text = textParam(value);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
