// errors.js — one error type for everything that can go wrong talking to the API,
// and the plain-language message a shopper should see for each.
//
// The backend answers every failure as { success:false, code, message, requestId,
// errors? } (see the backend's error-handling guide). The client adds two codes of
// its own for failures that never reach the server.

export const CLIENT_CODES = Object.freeze({
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  INVALID_RESPONSE: "INVALID_RESPONSE",
});

export class ApiError extends Error {
  /**
   * @param {object} fields
   * @param {number} [fields.status]     HTTP status, 0 when no response arrived
   * @param {string} fields.code         a backend or client code
   * @param {string} [fields.message]    the server's safe message, if any
   * @param {string} [fields.requestId]  quote this when reporting a problem
   * @param {Array}  [fields.details]    field errors for VALIDATION_ERROR
   */
  constructor({ status = 0, code, message = "", requestId, details }) {
    super(message || code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

const isApiError = (error) => error instanceof ApiError;

/**
 * What to show a shopper. Never the raw server text for a 5xx (the backend already
 * makes it generic, but the client does not rely on that), and never a stack.
 * @returns {{ title: string, message: string, reference?: string, canRetry: boolean }}
 */
export function describeError(error) {
  if (!isApiError(error)) {
    return { title: "Something went wrong", message: "An unexpected error occurred. Please try again.", canRetry: true };
  }

  const reference = error.requestId ? `Reference: ${error.requestId}` : undefined;

  switch (error.code) {
    case CLIENT_CODES.NETWORK_ERROR:
      return {
        title: "Can't reach ShopSavvy",
        message: "Check your internet connection and try again.",
        canRetry: true,
      };
    case CLIENT_CODES.TIMEOUT:
      return {
        title: "This is taking too long",
        message: "The stores are slow to respond right now. Please try again.",
        canRetry: true,
      };
    case "RATE_LIMITED":
      return {
        title: "Slow down a little",
        message: "You've made a lot of searches in a short time. Please wait a few minutes and try again.",
        reference,
        canRetry: false,
      };
    case "SERVICE_BUSY":
      return {
        title: "ShopSavvy is busy",
        message: "Lots of people are searching right now. Please try again in a few seconds.",
        reference,
        canRetry: true,
      };
    case "DATABASE_UNAVAILABLE":
    case "SERVICE_DISABLED":
      return {
        title: "ShopSavvy is temporarily unavailable",
        message: "We're having trouble on our side. Please try again in a moment.",
        reference,
        canRetry: true,
      };
    case "NOT_FOUND":
      return { title: "Not found", message: "We couldn't find what you were looking for.", reference, canRetry: false };
    case "INVALID_ID":
      return { title: "That link doesn't look right", message: "Try searching for the product again.", reference, canRetry: false };
    case "BAD_REQUEST":
    case "VALIDATION_ERROR": {
      // These messages are written for users ("Search query is too long ...").
      const fieldMessages = (error.details || []).map((d) => d.msg).filter(Boolean);
      return {
        title: "Please check your input",
        message: fieldMessages.length ? fieldMessages.join(". ") : error.message || "That request wasn't valid.",
        reference,
        canRetry: false,
      };
    }
    default:
      return {
        title: "Something went wrong",
        message: "This one's on our side. Please try again.",
        reference,
        canRetry: error.status >= 500 || error.status === 0,
      };
  }
}
