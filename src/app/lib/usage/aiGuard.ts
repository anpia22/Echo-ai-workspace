/**
 * P0.2 — AI request guard: identify the caller, enforce the rate limit, log usage.
 *
 *   const guard = await guardAiRequest(request, { route: "analyze", model });
 *   if (!guard.ok) return guard.response;          // 401 or 429
 *   const response = await handle(request);
 *   await guard.tracker.finish(response);          // records outcome + latency
 *
 * Callers are keyed by `user:<id>` when signed in, or `ip:<salted hash>` for the shared
 * demo/anonymous fallback (which gets the lower anonymous limit).
 */

import { PersistenceError } from "../persistence/server/errors";
import { resolveServerIdentity, type ServerIdentity } from "../persistence/server/auth";
import {
  MemoryWindowCounter,
  describeWait,
  evaluateLimit,
  getClientIpHash,
  getRateLimitConfig,
  type RateLimitConfig,
} from "./rateLimit";
import { createSupabaseUsageStore, type UsageOutcome, type UsageStore } from "./usageStore";

/** Response header a handler may set to refine the logged outcome; stripped before sending. */
export const AI_OUTCOME_HEADER = "x-echo-ai-outcome";

export type AiTracker = {
  /** Records the outcome of a handled request (never throws). */
  finish(response: Response): Promise<void>;
};

export type AiGuardResult =
  | { ok: true; tracker: AiTracker }
  | { ok: false; response: Response };

export type AiGuardOptions = {
  route: string;
  model: string;
};

export type AiGuardDeps = {
  store: UsageStore;
  memory: MemoryWindowCounter;
  getConfig: () => RateLimitConfig;
  resolveIdentity: (request: Request) => Promise<ServerIdentity>;
  now: () => number;
  salt: string;
};

function outcomeFromResponse(response: Response): UsageOutcome {
  const hinted = response.headers.get(AI_OUTCOME_HEADER);
  if (hinted === "timeout" || hinted === "unavailable") return hinted;
  return response.status >= 400 ? "error" : "ok";
}

export function createAiGuard(deps: AiGuardDeps) {
  return async function guardAiRequest(
    request: Request,
    options: AiGuardOptions
  ): Promise<AiGuardResult> {
    const config = deps.getConfig();

    let identity: ServerIdentity;
    try {
      identity = await deps.resolveIdentity(request);
    } catch (error) {
      if (error instanceof PersistenceError) {
        return {
          ok: false,
          response: Response.json(
            { error: { code: error.code, message: error.message } },
            { status: error.toHttpStatus() }
          ),
        };
      }
      throw error;
    }

    const userId = identity.authenticated ? identity.actor.userId : null;
    const actorKey = userId ? `user:${userId}` : `ip:${getClientIpHash(request, deps.salt)}`;
    const limit = userId ? config.userMax : config.anonMax;
    const nowMs = deps.now();

    if (config.enabled) {
      // The database log is authoritative; the in-memory counter covers it being unavailable.
      const counted =
        (await deps.store.recentCount(actorKey, nowMs - config.windowMs, limit)) ??
        deps.memory.snapshot(actorKey, nowMs, config.windowMs);

      const decision = evaluateLimit({
        count: counted.count,
        limit,
        oldestMs: counted.oldestMs,
        nowMs,
        windowMs: config.windowMs,
      });

      if (!decision.allowed) {
        console.warn(`[usage] rate limit hit for ${actorKey} (${limit} per ${Math.round(config.windowMs / 60000)} min)`);
        const windowLabel =
          config.windowMs === 3_600_000 ? "hour" : `${Math.round(config.windowMs / 60000)} minutes`;
        return {
          ok: false,
          response: Response.json(
            {
              error: `You've reached the AI limit of ${limit} requests per ${windowLabel}. Try again in ${describeWait(decision.retryAfterSeconds)}.`,
              code: "RATE_LIMITED",
              limit,
              retryAfterSeconds: decision.retryAfterSeconds,
            },
            { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } }
          ),
        };
      }
    }

    deps.memory.record(actorKey, nowMs);
    const usageId = await deps.store.start({
      actorKey,
      userId,
      isDemo: !identity.authenticated,
      route: options.route,
      model: options.model,
    });

    return {
      ok: true,
      tracker: {
        async finish(response: Response) {
          const status = outcomeFromResponse(response);
          response.headers.delete(AI_OUTCOME_HEADER);
          if (!usageId) return;
          await deps.store.finish(usageId, {
            status,
            httpStatus: response.status,
            latencyMs: deps.now() - nowMs,
          });
        },
      },
    };
  };
}

const defaultMemory = new MemoryWindowCounter();
let defaultStore: UsageStore | null = null;

/** Production guard wired to the real identity resolver and Supabase usage log. */
export const guardAiRequest = createAiGuard({
  get store() {
    return (defaultStore ??= createSupabaseUsageStore());
  },
  memory: defaultMemory,
  getConfig: () => getRateLimitConfig(),
  resolveIdentity: (request) => resolveServerIdentity(request),
  now: () => Date.now(),
  salt: process.env.USAGE_HASH_SALT || "echo-usage",
});
