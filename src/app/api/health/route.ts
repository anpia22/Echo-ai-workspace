/**
 * GET /api/health — public liveness/readiness check for uptime monitors.
 *
 * Deliberately minimal: it reports only whether the database answers and whether the AI
 * provider key is configured. No counts, versions, error text or usage data.
 * Detailed AI health lives behind a token at /api/health/ai.
 */

import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "../../lib/persistence/server/db";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3_000;

async function databaseAnswers(): Promise<boolean> {
  try {
    const query = getServerSupabaseClient()
      .from("workspaces")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .then(({ error }) => !error);
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DB_TIMEOUT_MS));
    return await Promise.race([query, timeout]);
  } catch {
    return false;
  }
}

export async function GET() {
  const database = await databaseAnswers();
  const aiConfigured = Boolean(process.env.NVIDIA_API_KEY?.trim());

  const status = !database ? "down" : aiConfigured ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      checks: {
        database: database ? "ok" : "fail",
        ai: aiConfigured ? "configured" : "missing",
      },
      time: new Date().toISOString(),
    },
    {
      status: database ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
