/**
 * P1.4 — AI call resilience: classify provider failures, retry the transient ones within a
 * hard time budget, optionally fall back to a second model, and word the failure for users.
 *
 * Pure (no OpenAI import, no I/O of its own): time, sleep and randomness are injected so the
 * behaviour is unit-tested deterministically. An analyze request never runs longer than
 * `deadlineMs` in total, so the UI cannot hang on a slow or dead provider.
 */

export type AiFailureKind =
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "auth"
  | "bad_request"
  | "other";

const NETWORK_CODES = /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|UND_ERR)/;

export function classifyFailure(error: unknown): AiFailureKind {
  const e = error as { status?: unknown; code?: unknown; name?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  const code = typeof e?.code === "string" ? e.code : "";
  const status = typeof e?.status === "number" ? e.status : null;

  if (name === "APIConnectionTimeoutError") return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status !== null && status >= 500) return "unavailable";
  if (status !== null && status >= 400) return "bad_request";
  if (name === "APIConnectionError" || NETWORK_CODES.test(code)) return "network";
  return "other";
}

/** Transient failures worth another attempt. Auth, bad requests and unknown errors are not. */
export function isRetryable(kind: AiFailureKind): boolean {
  return kind === "timeout" || kind === "rate_limited" || kind === "unavailable" || kind === "network";
}

/** Seconds from a Retry-After header on an error, if present and sane. */
export function retryAfterSeconds(error: unknown): number | null {
  const headers = (error as { headers?: unknown } | null)?.headers;
  let raw: unknown;
  if (headers && typeof (headers as { get?: unknown }).get === "function") {
    raw = (headers as { get: (k: string) => unknown }).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, unknown>)["retry-after"];
  }
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const RETRY_DELAY_CAP_MS = 3_000;

/** Exponential backoff with jitter, or the provider's Retry-After, never above the cap. */
export function retryDelayMs(attempt: number, retryAfter: number | null, random: () => number = Math.random): number {
  if (retryAfter !== null) return Math.min(RETRY_DELAY_CAP_MS, Math.round(retryAfter * 1000));
  return Math.min(RETRY_DELAY_CAP_MS, 500 * 2 ** attempt + Math.floor(random() * 250));
}

export type ResilienceOptions<T> = {
  /** Called with the per-attempt timeout in ms. */
  primary: (timeoutMs: number) => Promise<T>;
  /** Optional second model, tried once after the primary is exhausted by a transient failure. */
  fallback?: (timeoutMs: number) => Promise<T>;
  /** Total time for everything, retries and fallback included. */
  deadlineMs?: number;
  /** Longest a single attempt may take. */
  attemptTimeoutMs?: number;
  /** Retries of the primary after the first attempt. */
  maxRetries?: number;
  /** A new attempt is only started when at least this much of the budget remains. */
  minAttemptMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; kind: AiFailureKind; delayMs: number }) => void;
};

export type ResilienceResult<T> = { value: T; attempts: number; usedFallback: boolean };

export class AiCallFailed extends Error {
  readonly kind: AiFailureKind;
  readonly attempts: number;
  readonly cause: unknown;
  constructor(kind: AiFailureKind, attempts: number, cause: unknown) {
    super(`AI call failed (${kind}) after ${attempts} attempt(s)`);
    this.name = "AiCallFailed";
    this.kind = kind;
    this.attempts = attempts;
    this.cause = cause;
  }
}

export const DEFAULT_DEADLINE_MS = 55_000;
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 40_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_MIN_ATTEMPT_MS = 6_000;

export async function runWithResilience<T>(opts: ResilienceOptions<T>): Promise<ResilienceResult<T>> {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const minAttemptMs = opts.minAttemptMs ?? DEFAULT_MIN_ATTEMPT_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;

  const start = now();
  const remaining = () => deadlineMs - (now() - start);
  let attempts = 0;
  let lastError: unknown = null;
  let lastKind: AiFailureKind = "other";

  for (let retry = 0; retry <= maxRetries; retry++) {
    if (retry > 0 && remaining() < minAttemptMs) break;
    attempts++;
    try {
      const value = await opts.primary(Math.max(1, Math.min(attemptTimeoutMs, remaining())));
      return { value, attempts, usedFallback: false };
    } catch (error) {
      lastError = error;
      lastKind = classifyFailure(error);
      if (!isRetryable(lastKind)) throw new AiCallFailed(lastKind, attempts, error);
      if (retry === maxRetries) break;

      const delayMs = retryDelayMs(retry, retryAfterSeconds(error), random);
      // Waiting would leave too little time for another attempt: stop here.
      if (remaining() - delayMs < minAttemptMs) break;
      opts.onRetry?.({ attempt: attempts, kind: lastKind, delayMs });
      await sleep(delayMs);
    }
  }

  if (opts.fallback && remaining() >= minAttemptMs) {
    attempts++;
    try {
      const value = await opts.fallback(Math.max(1, Math.min(attemptTimeoutMs, remaining())));
      return { value, attempts, usedFallback: true };
    } catch (error) {
      // Report the primary's failure: it is the one the user needs to hear about.
      lastError = lastError ?? error;
    }
  }

  throw new AiCallFailed(lastKind, attempts, lastError);
}

// ---------------------------------------------------------------------------
// What the user sees
// ---------------------------------------------------------------------------

export type AiFailureResponse = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  /** Seconds to suggest before trying again, when it makes sense. */
  retryAfterSeconds?: number;
};

export function describeFailure(kind: AiFailureKind): AiFailureResponse {
  switch (kind) {
    case "timeout":
      return {
        status: 504,
        code: "ai_timeout",
        message: "Echo is taking longer than expected. Your message is saved. Please try again.",
        retryable: true,
        retryAfterSeconds: 5,
      };
    case "rate_limited":
      return {
        status: 503,
        code: "ai_busy",
        message: "Echo's AI is very busy right now. Please try again in a minute.",
        retryable: true,
        retryAfterSeconds: 30,
      };
    case "unavailable":
      return {
        status: 503,
        code: "ai_unavailable",
        message: "Echo's AI is temporarily unavailable. Please try again in a moment.",
        retryable: true,
        retryAfterSeconds: 15,
      };
    case "network":
      return {
        status: 503,
        code: "ai_unreachable",
        message: "Echo could not reach its AI service. Please try again in a moment.",
        retryable: true,
        retryAfterSeconds: 10,
      };
    default:
      // auth / bad_request / other: not the user's doing and not fixed by retrying right away.
      return {
        status: 500,
        code: "ai_error",
        message: "Echo couldn't process this request. Please try again.",
        retryable: false,
      };
  }
}
