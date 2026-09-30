// AppError.js — the one way the backend signals an error it expects.
//
// Code that knows what went wrong throws an AppError with an HTTP status, a
// stable machine-readable `code`, and a message that is safe to show. The
// global error handler (middleware/error.middleware.js) turns it into the
// response. Anything that is NOT an AppError is treated as a bug: it is logged
// with its detail and the client gets a generic message, so internals never
// leak.
//
// Clients should branch on `code`, not on the English message.

export const ERROR_CODES = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST",
  INVALID_ID: "INVALID_ID",
  INVALID_JSON: "INVALID_JSON",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  SERVICE_DISABLED: "SERVICE_DISABLED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

/** The default code for an HTTP status, when the thrower did not pick one. */
export function codeForStatus(statusCode) {
  switch (statusCode) {
    case 400: return ERROR_CODES.BAD_REQUEST;
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.NOT_FOUND;
    case 409: return ERROR_CODES.CONFLICT;
    case 413: return ERROR_CODES.PAYLOAD_TOO_LARGE;
    case 429: return ERROR_CODES.RATE_LIMITED;
    case 503: return ERROR_CODES.DATABASE_UNAVAILABLE;
    default: return statusCode >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST;
  }
}

export class AppError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message    text safe to show to the user
   * @param {object} [options]
   * @param {string} [options.code]    one of ERROR_CODES; defaults from the status
   * @param {Array}  [options.details] extra structured detail, e.g. field errors
   */
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code || codeForStatus(statusCode);
    this.details = details;
    // Marks the message as intended for the client.
    this.expose = true;
  }

  static badRequest(message, code) {
    return new AppError(400, message, { code });
  }

  static invalidId(message = "Invalid resource ID") {
    return new AppError(400, message, { code: ERROR_CODES.INVALID_ID });
  }

  static notFound(message = "Not found") {
    return new AppError(404, message);
  }

  /** Field-level validation failures, e.g. from express-validator's errors.array(). */
  static validation(errors, message = "Validation failed") {
    return new AppError(400, message, { code: ERROR_CODES.VALIDATION_ERROR, details: errors });
  }
}
