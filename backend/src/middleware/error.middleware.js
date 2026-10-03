// error.middleware.js — turns every failure into the same response shape:
//
//   { success: false, code, message, requestId, errors? }
//
// - `code` is stable and machine-readable; clients branch on it.
// - `message` is safe to show. For anything the code did not deliberately
//   raise as an AppError (a bug, a driver error) it is a generic sentence: the
//   real error, stack included, goes to the server log next to the request id,
//   never to the client.
// - `requestId` matches the log line, so a reported problem can be found.
// - `stack` is added only when NODE_ENV=development.

import { AppError, ERROR_CODES, codeForStatus } from "../errors/AppError.js";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Writes the standard error body. Also used directly by middleware that
 * answers without throwing (rate limiters, the admin key check).
 */
export function sendError(res, statusCode, code, message, extra = {}) {
  return res.status(statusCode).json({
    success: false,
    code,
    message,
    ...extra,
    requestId: res.req?.id,
  });
}

const DATABASE_ERROR_NAMES = new Set([
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
]);

function isDatabaseUnavailable(err) {
  if (DATABASE_ERROR_NAMES.has(err.name)) return true;
  // Mongoose gives up on a command it has been buffering while disconnected.
  return /buffering timed out|not connected|topology was destroyed/i.test(String(err.message));
}

/** Maps any thrown value to { statusCode, code, message, details? }. */
export function classifyError(err) {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err?.name === "CastError") {
    return { statusCode: 400, code: ERROR_CODES.INVALID_ID, message: "Invalid resource ID" };
  }

  if (err?.name === "ValidationError" && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, msg: e.message }));
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: details.map((d) => d.msg).join(", "),
      details,
    };
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return {
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: field ? `${field} already exists` : "Duplicate resource",
    };
  }

  // Errors raised by express.json() while reading the request body.
  if (err?.type === "entity.parse.failed") {
    return { statusCode: 400, code: ERROR_CODES.INVALID_JSON, message: "Request body is not valid JSON" };
  }
  if (err?.type === "entity.too.large") {
    return { statusCode: 413, code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: "Request body is too large" };
  }

  if (err && isDatabaseUnavailable(err)) {
    return {
      statusCode: 503,
      code: ERROR_CODES.DATABASE_UNAVAILABLE,
      message: "The service is temporarily unavailable. Please try again shortly.",
    };
  }

  // Other client errors raised by middleware (http-errors marks these `expose`).
  const status = err?.status || err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500 && err.expose) {
    return { statusCode: status, code: codeForStatus(status), message: err.message };
  }

  return { statusCode: 500, code: ERROR_CODES.INTERNAL_ERROR, message: GENERIC_MESSAGE };
}

export const notFoundHandler = (req, res) =>
  sendError(res, 404, ERROR_CODES.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl.split("?")[0]}`);

// Express recognises an error handler by its four parameters.
// eslint-disable-next-line no-unused-vars
export const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { statusCode, code, message, details } = classifyError(err);
  const where = `${req.method} ${req.originalUrl.split("?")[0]}`;

  if (statusCode >= 500) {
    // The full error, with stack, stays in the log.
    console.error("[error] [req %s] %s -> %s %s", req.id, where, statusCode, code, err);
  } else {
    console.warn("[req %s] %s -> %s %s: %s", req.id, where, statusCode, code, message);
  }

  return sendError(res, statusCode, code, message, {
    ...(details ? { errors: details } : {}),
    ...(process.env.NODE_ENV === "development" && err?.stack ? { stack: err.stack } : {}),
  });
};
