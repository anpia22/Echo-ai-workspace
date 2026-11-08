/**
 * P0.2 — Usage log storage (server-only).
 *
 * One row per AI request in `ai_usage_events`. This is the shared log that rate
 * limiting reads now and that monitoring (P0.3) and the admin panel (P1.6) read later.
 *
 * Every method FAILS OPEN: if the table is missing (migration not applied yet) or the
 * database is down, methods return null/void and the caller falls back to the in-memory
 * counter. A logging problem must never block a user's AI request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseClient } from "../persistence/server/db";

export type UsageStart = {
  actorKey: string;
  userId: string | null;
  isDemo: boolean;
  route: string;
  model: string;
};

export type UsageOutcome = "ok" | "error" | "timeout" | "unavailable";

export type UsageFinish = {
  status: UsageOutcome;
  httpStatus: number;
  latencyMs: number;
  errorCode?: string;
};

export interface UsageStore {
  /** Requests by `actorKey` since `sinceMs`, oldest first (at most `limit` rows are read). */
  recentCount(
    actorKey: string,
    sinceMs: number,
    limit: number
  ): Promise<{ count: number; oldestMs: number | null } | null>;
  /** Inserts a pending row; returns its id, or null if logging is unavailable. */
  start(entry: UsageStart): Promise<string | null>;
  finish(id: string, result: UsageFinish): Promise<void>;
}

const TABLE = "ai_usage_events";
let warned = false;

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[usage] ${message} — falling back to in-memory limiting. Is the ai_usage_events migration applied?`);
}

export function createSupabaseUsageStore(getClient: () => SupabaseClient = getServerSupabaseClient): UsageStore {
  return {
    async recentCount(actorKey, sinceMs, limit) {
      try {
        const { data, error } = await getClient()
          .from(TABLE)
          .select("created_at")
          .eq("actor_key", actorKey)
          .gte("created_at", new Date(sinceMs).toISOString())
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) {
          warnOnce(`count failed: ${error.message}`);
          return null;
        }
        const rows = data ?? [];
        return {
          count: rows.length,
          oldestMs: rows.length > 0 ? new Date(String(rows[0].created_at)).getTime() : null,
        };
      } catch (e) {
        warnOnce(`count failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },

    async start(entry) {
      try {
        const { data, error } = await getClient()
          .from(TABLE)
          .insert({
            actor_key: entry.actorKey,
            user_id: entry.userId,
            is_demo: entry.isDemo,
            route: entry.route,
            model: entry.model,
            status: "pending",
          })
          .select("id")
          .single();
        if (error || !data) {
          warnOnce(`insert failed: ${error?.message ?? "no row returned"}`);
          return null;
        }
        return String(data.id);
      } catch (e) {
        warnOnce(`insert failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },

    async finish(id, result) {
      try {
        await getClient()
          .from(TABLE)
          .update({
            status: result.status,
            http_status: result.httpStatus,
            latency_ms: Math.max(0, Math.round(result.latencyMs)),
            error_code: result.errorCode ?? null,
          })
          .eq("id", id);
      } catch {
        // Logging must never affect the response.
      }
    },
  };
}
