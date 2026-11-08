/**
 * P0.2 — Rate limit primitives (pure; no I/O, no framework imports).
 *
 * Config (all optional, set in the server environment):
 *   AI_RATE_LIMIT_USER_MAX       requests per window for signed-in users  (default 30)
 *   AI_RATE_LIMIT_ANON_MAX       requests per window for anonymous / demo (default 10)
 *   AI_RATE_LIMIT_WINDOW_MINUTES window length in minutes                 (default 60)
 *   AI_RATE_LIMIT_DISABLED=true  turns enforcement off (usage is still logged)
 */

import { createHash } from "node:crypto";

export const DEFAULT_USER_MAX = 30;
export const DEFAULT_ANON_MAX = 10;
export const DEFAULT_WINDOW_MINUTES = 60;

export type RateLimitConfig = {
  enabled: boolean;
  userMax: number;
  anonMax: number;
  windowMs: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function getRateLimitConfig(
  env: Record<string, string | undefined> = process.env
): RateLimitConfig {
  return {
    enabled: (env.AI_RATE_LIMIT_DISABLED ?? "").trim().toLowerCase() !== "true",
    userMax: parsePositiveInt(env.AI_RATE_LIMIT_USER_MAX, DEFAULT_USER_MAX, 10_000),
    anonMax: parsePositiveInt(env.AI_RATE_LIMIT_ANON_MAX, DEFAULT_ANON_MAX, 10_000),
    windowMs: parsePositiveInt(env.AI_RATE_LIMIT_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES, 1_440) * 60_000,
  };
}

export type LimitDecision = {
  allowed: boolean;
  limit: number;
  /** Requests left in the window after this one (0 when blocked). */
  remaining: number;
  /** Seconds until the oldest request leaves the window; 0 when allowed. */
  retryAfterSeconds: number;
};

/**
 * Decides whether one more request fits in the window.
 * `count` is the number of requests already made inside the window and
 * `oldestMs` the timestamp (epoch ms) of the oldest of them.
 */
export function evaluateLimit(input: {
  count: number;
  limit: number;
  oldestMs: number | null;
  nowMs: number;
  windowMs: number;
}): LimitDecision {
  const { count, limit, oldestMs, nowMs, windowMs } = input;

  if (count < limit) {
    return { allowed: true, limit, remaining: Math.max(0, limit - count - 1), retryAfterSeconds: 0 };
  }

  const frees = (oldestMs ?? nowMs) + windowMs;
  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((frees - nowMs) / 1000)),
  };
}

/** "less than a minute", "about 12 minutes", "about 1 hour". */
export function describeWait(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Per-process sliding-window counter. Used when the database log is unavailable
 * (table not migrated yet, or a transient outage). It is per server instance, so
 * on multi-instance deployments the database count is the authoritative one.
 */
export class MemoryWindowCounter {
  private readonly events = new Map<string, number[]>();
  private static readonly PRUNE_THRESHOLD = 5_000;

  record(key: string, nowMs: number): void {
    const list = this.events.get(key);
    if (list) {
      list.push(nowMs);
    } else {
      this.events.set(key, [nowMs]);
    }
  }

  snapshot(key: string, nowMs: number, windowMs: number): { count: number; oldestMs: number | null } {
    const recent = (this.events.get(key) ?? []).filter((t) => nowMs - t < windowMs);
    if (recent.length > 0) {
      this.events.set(key, recent);
    } else {
      this.events.delete(key);
    }
    this.pruneIfLarge(nowMs, windowMs);
    return { count: recent.length, oldestMs: recent.length > 0 ? recent[0] : null };
  }

  private pruneIfLarge(nowMs: number, windowMs: number): void {
    if (this.events.size <= MemoryWindowCounter.PRUNE_THRESHOLD) return;
    for (const [key, list] of this.events) {
      if (list.every((t) => nowMs - t >= windowMs)) this.events.delete(key);
    }
  }
}

/**
 * Anonymous callers are identified by a salted hash of their IP, so the usage log
 * never stores raw addresses. Behind a proxy the first X-Forwarded-For entry is
 * used; only trust it when the platform (e.g. Vercel) sets that header itself.
 */
export function getClientIpHash(request: Request, salt: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
