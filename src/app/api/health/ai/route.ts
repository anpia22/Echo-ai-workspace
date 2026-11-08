/**
 * GET /api/health/ai — AI health summary from the usage log (token protected).
 *
 *   curl -H "Authorization: Bearer $HEALTH_CHECK_TOKEN" https://<host>/api/health/ai
 *
 * Returns request counts, failure rate, p50/p95 latency and an ok/degraded/down verdict for
 * the last 15 minutes and the last 24 hours. Counts and timings only, no user content or ids.
 * The same summarizeUsage/evaluateAiHealth functions will feed the admin panel (P1.6).
 *
 * Disabled (404) unless HEALTH_CHECK_TOKEN is set to at least 16 characters.
 */

import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "../../../lib/persistence/server/db";
import { evaluateAiHealth, summarizeUsage, type UsageRow } from "../../../lib/observability/aiHealth";
import { isAuthorizedHealthRequest } from "../../../lib/observability/healthAuth";
import { logger } from "../../../lib/observability/logger";

export const dynamic = "force-dynamic";

const RECENT_WINDOW_MS = 15 * 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60_000;
const ROW_LIMIT = 5_000;

export async function GET(request: Request) {
  if (!isAuthorizedHealthRequest(request.headers.get("authorization"), process.env.HEALTH_CHECK_TOKEN)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const nowMs = Date.now();

  const { data, error } = await getServerSupabaseClient()
    .from("ai_usage_events")
    .select("created_at, status, latency_ms, error_code")
    .gte("created_at", new Date(nowMs - DAY_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    logger.error("health.ai.query_failed", { reason: error.message });
    return NextResponse.json(
      { error: "Usage log unavailable", hint: "Is the ai_usage_events migration applied?" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rows = (data ?? []) as UsageRow[];
  const recent = summarizeUsage(rows, nowMs, RECENT_WINDOW_MS);
  const day = summarizeUsage(rows, nowMs, DAY_WINDOW_MS);

  return NextResponse.json(
    {
      generatedAt: new Date(nowMs).toISOString(),
      // true when the 24h view may be incomplete because the row cap was reached
      truncated: rows.length >= ROW_LIMIT,
      last15Minutes: { summary: recent, verdict: evaluateAiHealth(recent) },
      last24Hours: { summary: day, verdict: evaluateAiHealth(day) },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
