/**
 * Phase 13.3 — Server Persistence Error Model
 *
 * Strongly-typed domain error representation for persistence and repository operations.
 * Designed to cleanly translate to HTTP status codes in future API route handlers (Phase 13.4).
 * Never leaks raw database internals, connection strings, or credentials.
 */

export type PersistenceErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_REVISION"
  | "VALIDATION_ERROR"
  | "DUPLICATE_ID"
  | "INVALID_RELATIONSHIP"
  | "DATABASE_ERROR";

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: PersistenceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
    this.details = details;
    this.status = PersistenceError.toHttpStatus(code);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersistenceError);
    }
  }

  toHttpStatus(): number {
    return this.status;
  }

  static toHttpStatus(code: PersistenceErrorCode): number {
    switch (code) {
      case "UNAUTHORIZED":
        return 401;
      case "FORBIDDEN":
        return 403;
      case "NOT_FOUND":
        return 404;
      case "CONFLICT":
      case "DUPLICATE_ID":
      case "INVALID_RELATIONSHIP":
        return 409;
      case "STALE_REVISION":
        return 409;
      case "VALIDATION_ERROR":
        return 400;
      case "DATABASE_ERROR":
      default:
        return 500;
    }
  }
}
