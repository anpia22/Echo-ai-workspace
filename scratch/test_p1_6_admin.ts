/**
 * P1.6 — Admin panel: who is an admin, how stats are aggregated, and what never leaks.
 *
 * Run: npx tsx scratch/test_p1_6_admin.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";
process.env.NVIDIA_API_KEY = "dummy";

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "../src/app/lib/admin/adminAuth";
import {
  bucketByDay,
  dayKey,
  labelActor,
  loadAdminStats,
  summarizeUsers,
  topActors,
} from "../src/app/lib/admin/adminStats";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const NOW = new Date("2026-11-09T12:00:00Z").getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

type Row = Record<string, unknown>;

/** Fake client covering exactly the reads loadAdminStats performs. */
function fakeClient(opts: { users: Row[]; tables: Record<string, Row[]>; failTable?: string }): SupabaseClient {
  const from = (table: string) => {
    const rows = opts.tables[table] ?? [];
    const failing = opts.failTable === table;
    let wantCount = false;
    const builder: Record<string, unknown> = {
      select: (_cols: string, o?: { count?: string; head?: boolean }) => {
        wantCount = Boolean(o?.count);
        return builder;
      },
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (v: unknown) => void) =>
        resolve(
          failing
            ? { data: null, count: null, error: { message: "boom" } }
            : wantCount
              ? { data: null, count: rows.length, error: null }
              : { data: rows, count: null, error: null }
        ),
    };
    return builder;
  };
  const auth = {
    admin: {
      listUsers: async ({ page }: { page: number }) => ({
        data: { users: page === 1 ? opts.users : [] },
        error: null,
      }),
    },
  };
  return { from, auth } as unknown as SupabaseClient;
}

async function main() {
  console.log("who is an admin");
  const env = { ADMIN_USER_IDS: "uid-1, UID-2", ADMIN_EMAILS: "Boss@Example.com, other@example.com" };
  check("listed user id is admin (case-insensitive, trimmed)", isAdmin({ id: "uid-1" }, env) && isAdmin({ id: "uid-2" }, env));
  check("confirmed listed email is admin (case-insensitive)", isAdmin({ id: "x", email: "boss@example.com", emailConfirmed: true }, env));
  check("UNCONFIRMED listed email is NOT admin", !isAdmin({ id: "x", email: "boss@example.com", emailConfirmed: false }, env) && !isAdmin({ id: "x", email: "boss@example.com" }, env));
  check("unlisted user is not admin", !isAdmin({ id: "uid-9", email: "me@example.com", emailConfirmed: true }, env));
  check("no env -> nobody is admin", !isAdmin({ id: "uid-1", email: "boss@example.com", emailConfirmed: true }, {}));
  check("empty env strings -> nobody is admin", !isAdmin({ id: "", email: "", emailConfirmed: true }, { ADMIN_USER_IDS: "", ADMIN_EMAILS: " , " }));
  check("signed-out (null) is not admin", !isAdmin(null, env) && !isAdmin(undefined, env));
  check("partial id does not match", !isAdmin({ id: "uid" }, env) && !isAdmin({ id: "uid-11" }, env));

  console.log("aggregation");
  const days = bucketByDay([iso(NOW), iso(NOW - HOUR), iso(NOW - DAY), iso(NOW - 40 * DAY), null, "garbage"], NOW, 14);
  check("14 buckets, oldest first, ending today", days.length === 14 && days[13].day === dayKey(NOW) && days[0].day === dayKey(NOW - 13 * DAY));
  check("counts land in the right day", days[13].count === 2 && days[12].count === 1);
  check("old, null and invalid timestamps are ignored", days.reduce((a, d) => a + d.count, 0) === 3);
  check("empty days are zero-filled", days.filter((d) => d.count === 0).length === 12);

  const users = summarizeUsers(
    [
      { created_at: iso(NOW - HOUR), last_sign_in_at: iso(NOW - HOUR) },
      { created_at: iso(NOW - 3 * DAY), last_sign_in_at: iso(NOW - 3 * DAY) },
      { created_at: iso(NOW - 30 * DAY), last_sign_in_at: iso(NOW - 20 * DAY) },
      { created_at: iso(NOW - 30 * DAY), last_sign_in_at: null },
    ],
    NOW
  );
  check("users: total and 7-day activity", users.total === 4 && users.active7d === 2);
  check("users: only recent sign-ups in the 14-day series", users.newPerDay.reduce((a, d) => a + d.count, 0) === 2);

  check("actor label is short and typed", (() => { const l = labelActor("user:123e4567-e89b-12d3-a456-426614174000"); return l.kind === "user" && l.label === "123e4567"; })());
  check("ip hash is labelled as visitor, truncated", (() => { const l = labelActor("ip:abcdef0123456789abcdef"); return l.kind === "visitor" && l.label === "abcdef01"; })());
  const top = topActors([
    { actor_key: "user:aaaaaaaa-1", status: "ok" },
    { actor_key: "user:aaaaaaaa-1", status: "error" },
    { actor_key: "user:aaaaaaaa-1", status: "ok" },
    { actor_key: "ip:bbbbbbbb2", status: "ok" },
    { actor_key: "user:cccccccc-3", status: "timeout" },
  ], 2);
  check("top actors sorted by requests, limited", top.length === 2 && top[0].label === "aaaaaaaa" && top[0].requests === 3 && top[0].failures === 1);

  console.log("loadAdminStats");
  const FULL_ID = "123e4567-e89b-12d3-a456-426614174000";
  const client = fakeClient({
    users: [
      { id: FULL_ID, email: "secret.person@example.com", created_at: iso(NOW - HOUR), last_sign_in_at: iso(NOW - HOUR) },
      { id: "u2", email: "second@example.com", created_at: iso(NOW - 5 * DAY), last_sign_in_at: iso(NOW - 5 * DAY) },
    ],
    tables: {
      workspaces: [
        { created_at: iso(NOW - HOUR), updated_at: iso(NOW - HOUR) },
        { created_at: iso(NOW - 20 * DAY), updated_at: iso(NOW - 20 * DAY) },
      ],
      workspace_members: [{}, {}, {}],
      conversations: [{}, {}],
      meetings: [{}],
      collaboration_rooms: [{}, {}],
      ai_usage_events: [
        { created_at: iso(NOW - 5 * 60_000), actor_key: `user:${FULL_ID}`, status: "ok", latency_ms: 2000, error_code: null },
        { created_at: iso(NOW - 2 * HOUR), actor_key: `user:${FULL_ID}`, status: "error", latency_ms: 500, error_code: "network" },
        { created_at: iso(NOW - 3 * DAY), actor_key: "ip:feedfacecafebeef0123", status: "ok", latency_ms: 4000, error_code: null },
        { created_at: iso(NOW - 2 * 60_000), actor_key: `user:${FULL_ID}`, status: "pending", latency_ms: null, error_code: null },
      ],
    },
  });
  const stats = await loadAdminStats(client, NOW);
  check("users counted", stats.users.total === 2 && stats.users.active7d === 2);
  check("workspace counts", stats.workspaces.total === 2 && stats.workspaces.members === 3 && stats.workspaces.conversations === 2 && stats.workspaces.meetings === 1 && stats.workspaces.rooms === 2 && stats.workspaces.active7d === 1);
  check("AI 24h summary", stats.ai.last24h.total === 3 && stats.ai.last24h.ok === 1 && stats.ai.last24h.error === 1 && stats.ai.last24h.pending === 1);
  check("average latency ignores pending", stats.ai.avgLatencyMs === Math.round((2000 + 500 + 4000) / 3));
  check("requests per day covers 14 days", stats.ai.requestsPerDay.length === 14 && stats.ai.requestsPerDay.reduce((a, d) => a + d.count, 0) === 4);
  check("top actors aggregated", stats.ai.topActors[0].requests === 3 && stats.ai.topActors[0].label === FULL_ID.slice(0, 8));
  check("health block present", stats.health.database === true && stats.health.aiKeyConfigured === true && typeof stats.health.ai15m.level === "string");

  const serialized = JSON.stringify(stats);
  check("privacy: no email address anywhere in the output", !/@example\.com|secret\.person/.test(serialized));
  check("privacy: no full user id or full IP hash in the output", !serialized.includes(FULL_ID) && !serialized.includes("feedfacecafebeef0123"));

  const broken = await loadAdminStats(fakeClient({ users: [], tables: {}, failTable: "ai_usage_events" }), NOW).then(() => null, (e: Error) => e.message);
  check("a failing table surfaces as an error (page shows a message)", typeof broken === "string" && /ai_usage_events/.test(broken));

  console.log("wiring / safety");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const page = read("src/app/admin/page.tsx");
  const statsSrc = read("src/app/lib/admin/adminStats.ts");
  check("page 404s non-admins before loading any data", page.indexOf("await requireAdmin()") !== -1 && page.indexOf("await requireAdmin()") < page.indexOf("loadAdminStats(") && /notFound\(\)/.test(page));
  check("page is never indexed or cached", /index: false/.test(page) && /force-dynamic/.test(page));
  check("admins come from env only", /ADMIN_USER_IDS/.test(page) && /ADMIN_EMAILS/.test(page));
  check("stats never select content columns", !/\bcontent\b|transcript|"messages"|canvas_nodes|\bemail\b/.test(statsSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  check("page is read-only (no forms, mutations or actions)", !/<form|onClick|"use server"|method="post"/i.test(page));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
