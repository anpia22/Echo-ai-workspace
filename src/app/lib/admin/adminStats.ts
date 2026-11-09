/**
 * P1.6 — Admin panel data. Counts and metadata only: no conversation, canvas, transcript
 * or message content, and no email addresses, is ever read into these structures.
 *
 * Aggregation is pure (unit-tested); loadAdminStats does the reads with a service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateAiHealth,
  summarizeUsage,
  type UsageRow,
  type UsageSummary,
} from "../observability/aiHealth";

export const DAYS = 14;
const DAY_MS = 24 * 60 * 60_000;
const USAGE_ROW_LIMIT = 20_000;
const USER_PAGE_SIZE = 1_000;
const USER_MAX_PAGES = 10;

export type DayCount = { day: string; count: number };

/** UTC day key, e.g. "2026-11-09". */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Counts per UTC day for the last `days` days, oldest first, zero-filled. */
export function bucketByDay(timestamps: Array<string | null | undefined>, nowMs: number, days: number = DAYS): DayCount[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) buckets.set(dayKey(nowMs - i * DAY_MS), 0);
  for (const t of timestamps) {
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (Number.isNaN(ms)) continue;
    const key = dayKey(ms);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets, ([day, count]) => ({ day, count }));
}

export type TopActor = { label: string; requests: number; failures: number; kind: "user" | "visitor" };

type ActorRow = { actor_key: string; status: string };

/** Short, non-reversible label: first 8 chars of the id or IP hash. Never the full value. */
export function labelActor(actorKey: string): { label: string; kind: "user" | "visitor" } {
  const [kind, ...rest] = actorKey.split(":");
  const id = rest.join(":");
  return { label: id.slice(0, 8) || "unknown", kind: kind === "user" ? "user" : "visitor" };
}

export function topActors(rows: ActorRow[], limit = 5): TopActor[] {
  const byActor = new Map<string, { requests: number; failures: number }>();
  for (const r of rows) {
    const cur = byActor.get(r.actor_key) ?? { requests: 0, failures: 0 };
    cur.requests++;
    if (r.status === "error" || r.status === "timeout" || r.status === "unavailable") cur.failures++;
    byActor.set(r.actor_key, cur);
  }
  return Array.from(byActor, ([key, v]) => ({ ...labelActor(key), ...v }))
    .sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export type AuthUserLite = { created_at?: string | null; last_sign_in_at?: string | null };

export function summarizeUsers(users: AuthUserLite[], nowMs: number) {
  const weekAgo = nowMs - 7 * DAY_MS;
  const active7d = users.filter((u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgo).length;
  return {
    total: users.length,
    active7d,
    newPerDay: bucketByDay(users.map((u) => u.created_at), nowMs),
  };
}

export type AdminStats = {
  generatedAt: string;
  health: {
    database: boolean;
    aiKeyConfigured: boolean;
    ai15m: ReturnType<typeof evaluateAiHealth>;
  };
  users: ReturnType<typeof summarizeUsers> & { truncated: boolean };
  workspaces: {
    total: number;
    members: number;
    conversations: number;
    meetings: number;
    rooms: number;
    newPerDay: DayCount[];
    active7d: number;
  };
  ai: {
    requestsPerDay: DayCount[];
    last24h: UsageSummary;
    last15m: UsageSummary;
    avgLatencyMs: number | null;
    topActors: TopActor[];
    truncated: boolean;
  };
};

async function count(client: SupabaseClient, table: string): Promise<number> {
  const { count: n, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

export async function loadAdminStats(client: SupabaseClient, nowMs: number = Date.now()): Promise<AdminStats> {
  const since = new Date(nowMs - DAYS * DAY_MS).toISOString();

  // Users (Supabase Auth). Only dates are kept; emails never leave this function.
  const users: AuthUserLite[] = [];
  let usersTruncated = false;
  for (let page = 1; page <= USER_MAX_PAGES; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: USER_PAGE_SIZE });
    if (error) throw new Error(`list users: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch.map((u) => ({ created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })));
    if (batch.length < USER_PAGE_SIZE) break;
    if (page === USER_MAX_PAGES) usersTruncated = true;
  }

  const [wsRows, members, conversations, meetings, rooms, usageRes] = await Promise.all([
    client.from("workspaces").select("created_at, updated_at").order("created_at", { ascending: false }).limit(20_000),
    count(client, "workspace_members"),
    count(client, "conversations"),
    count(client, "meetings"),
    count(client, "collaboration_rooms"),
    client
      .from("ai_usage_events")
      .select("created_at, actor_key, status, latency_ms, error_code")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(USAGE_ROW_LIMIT),
  ]);
  if (wsRows.error) throw new Error(`workspaces: ${wsRows.error.message}`);
  if (usageRes.error) throw new Error(`ai_usage_events: ${usageRes.error.message}`);

  const workspaces = (wsRows.data ?? []) as Array<{ created_at: string; updated_at: string }>;
  const usage = (usageRes.data ?? []) as Array<UsageRow & { actor_key: string }>;

  const weekAgo = nowMs - 7 * DAY_MS;
  const last24h = summarizeUsage(usage, nowMs, DAY_MS);
  const last15m = summarizeUsage(usage, nowMs, 15 * 60_000);
  const latencies = usage.filter((r) => r.status !== "pending" && typeof r.latency_ms === "number").map((r) => r.latency_ms as number);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    health: {
      database: true,
      aiKeyConfigured: Boolean(process.env.NVIDIA_API_KEY?.trim()),
      ai15m: evaluateAiHealth(last15m),
    },
    users: { ...summarizeUsers(users, nowMs), truncated: usersTruncated },
    workspaces: {
      total: workspaces.length,
      members,
      conversations,
      meetings,
      rooms,
      newPerDay: bucketByDay(workspaces.map((w) => w.created_at), nowMs),
      active7d: workspaces.filter((w) => new Date(w.updated_at).getTime() >= weekAgo).length,
    },
    ai: {
      requestsPerDay: bucketByDay(usage.map((r) => r.created_at), nowMs),
      last24h,
      last15m,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      topActors: topActors(usage.filter((r) => new Date(r.created_at).getTime() >= nowMs - 7 * DAY_MS), 5),
      truncated: usage.length >= USAGE_ROW_LIMIT,
    },
  };
}
