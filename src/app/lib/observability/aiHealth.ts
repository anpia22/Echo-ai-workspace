/**
 * P0.3 — AI health: classify provider errors, summarize the usage log, judge health.
 *
 * Pure functions (no I/O) so they are easy to test and reuse; the admin panel (P1.6)
 * will call the same summarizeUsage/evaluateAiHealth over the same ai_usage_events data.
 */

// ---------------------------------------------------------------------------
// Error classification (stored in ai_usage_events.error_code)
// ---------------------------------------------------------------------------

export const AI_ERROR_CODES = [
  "unparseable_response",
  "empty_response",
  "provider_auth",
  "provider_rate_limited",
  "provider_server_error",
  "provider_bad_request",
  "network",
  "internal",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Maps a thrown error from the AI call to a stable, low-cardinality code. */
export function classifyAiError(error: unknown): AiErrorCode {
  const e = error as { status?: unknown; code?: unknown; message?: unknown; name?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : null;

  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "provider_rate_limited";
  if (status !== null && status >= 500) return "provider_server_error";
  if (status !== null && status >= 400) return "provider_bad_request";

  const message = typeof e?.message === "string" ? e.message : "";
  if (/empty ai response/i.test(message)) return "empty_response";

  const code = typeof e?.code === "string" ? e.code : "";
  const name = typeof e?.name === "string" ? e.name : "";
  if (/^(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|UND_ERR)/.test(code) || /ConnectionError/.test(name)) {
    return "network";
  }
  return "internal";
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type UsageRow = {
  created_at: string;
  status: string;
  latency_ms: number | null;
  error_code: string | null;
};

export type UsageSummary = {
  windowMs: number;
  total: number;
  /** Requests that have not finished (status "pending"); excluded from rates. */
  pending: number;
  ok: number;
  error: number;
  timeout: number;
  unavailable: number;
  /** (error + timeout + unavailable) / finished, 0 when nothing finished. */
  failureRate: number;
  /** Requests with status ok but an error_code, e.g. unparseable AI replies. */
  degradedReplies: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  maxLatencyMs: number | null;
  topErrorCodes: Array<{ code: string; count: number }>;
};

/** Nearest-rank percentile of an ascending-sorted array. */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

export function summarizeUsage(rows: UsageRow[], nowMs: number, windowMs: number): UsageSummary {
  const since = nowMs - windowMs;
  const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= since);

  const counts = { ok: 0, error: 0, timeout: 0, unavailable: 0, pending: 0 };
  const latencies: number[] = [];
  const codes = new Map<string, number>();
  let degradedReplies = 0;

  for (const r of inWindow) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
    if (r.status !== "pending" && typeof r.latency_ms === "number") latencies.push(r.latency_ms);
    if (r.error_code) {
      codes.set(r.error_code, (codes.get(r.error_code) ?? 0) + 1);
      if (r.status === "ok") degradedReplies++;
    }
  }

  latencies.sort((a, b) => a - b);
  const finished = inWindow.length - counts.pending;
  const failures = counts.error + counts.timeout + counts.unavailable;

  return {
    windowMs,
    total: inWindow.length,
    pending: counts.pending,
    ok: counts.ok,
    error: counts.error,
    timeout: counts.timeout,
    unavailable: counts.unavailable,
    failureRate: finished > 0 ? failures / finished : 0,
    degradedReplies,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    maxLatencyMs: latencies.length ? latencies[latencies.length - 1] : null,
    topErrorCodes: Array.from(codes, ([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Health judgement
// ---------------------------------------------------------------------------

export type HealthLevel = "idle" | "ok" | "degraded" | "down";

export type HealthThresholds = {
  /** Fewer finished requests than this => too little data to judge ("idle"). */
  minRequests: number;
  degradedFailureRate: number;
  downFailureRate: number;
  degradedP95Ms: number;
};

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  minRequests: 5,
  degradedFailureRate: 0.2,
  downFailureRate: 0.5,
  degradedP95Ms: 30_000,
};

export type HealthVerdict = { level: HealthLevel; reasons: string[] };

export function evaluateAiHealth(
  summary: UsageSummary,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): HealthVerdict {
  const finished = summary.total - summary.pending;
  if (finished < thresholds.minRequests) {
    return { level: "idle", reasons: [`only ${finished} finished request(s) in the window`] };
  }

  const reasons: string[] = [];
  let level: HealthLevel = "ok";
  const pct = Math.round(summary.failureRate * 100);

  if (summary.failureRate >= thresholds.downFailureRate) {
    level = "down";
    reasons.push(`${pct}% of requests failed`);
  } else if (summary.failureRate >= thresholds.degradedFailureRate) {
    level = "degraded";
    reasons.push(`${pct}% of requests failed`);
  }

  if (summary.p95LatencyMs !== null && summary.p95LatencyMs >= thresholds.degradedP95Ms) {
    if (level === "ok") level = "degraded";
    reasons.push(`p95 latency is ${(summary.p95LatencyMs / 1000).toFixed(1)}s`);
  }

  return { level, reasons };
}
