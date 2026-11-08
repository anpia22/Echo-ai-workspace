/**
 * P0.2 — Rate limiting and AI usage log
 *
 * Run: npx tsx scratch/test_p0_2_rate_limit.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import {
  DEFAULT_ANON_MAX,
  DEFAULT_USER_MAX,
  MemoryWindowCounter,
  describeWait,
  evaluateLimit,
  getClientIpHash,
  getRateLimitConfig,
} from "../src/app/lib/usage/rateLimit";
import { AI_OUTCOME_HEADER, createAiGuard } from "../src/app/lib/usage/aiGuard";
import type { UsageFinish, UsageStart, UsageStore } from "../src/app/lib/usage/usageStore";
import { PersistenceError } from "../src/app/lib/persistence/server/errors";

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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
const MIN = 60_000;
const HOUR = 60 * MIN;

console.log("config");
const def = getRateLimitConfig({});
check("defaults", def.enabled && def.userMax === DEFAULT_USER_MAX && def.anonMax === DEFAULT_ANON_MAX && def.windowMs === HOUR);
const custom = getRateLimitConfig({ AI_RATE_LIMIT_USER_MAX: "5", AI_RATE_LIMIT_ANON_MAX: "2", AI_RATE_LIMIT_WINDOW_MINUTES: "10" });
check("custom values", custom.userMax === 5 && custom.anonMax === 2 && custom.windowMs === 10 * MIN);
const junk = getRateLimitConfig({ AI_RATE_LIMIT_USER_MAX: "abc", AI_RATE_LIMIT_ANON_MAX: "-4", AI_RATE_LIMIT_WINDOW_MINUTES: "0" });
check("invalid values fall back to defaults", junk.userMax === DEFAULT_USER_MAX && junk.anonMax === DEFAULT_ANON_MAX && junk.windowMs === HOUR);
check("values are capped", getRateLimitConfig({ AI_RATE_LIMIT_USER_MAX: "99999999" }).userMax === 10_000);
check("AI_RATE_LIMIT_DISABLED=true disables", !getRateLimitConfig({ AI_RATE_LIMIT_DISABLED: "true" }).enabled);
check("other disabled values do not disable", getRateLimitConfig({ AI_RATE_LIMIT_DISABLED: "false" }).enabled);

console.log("evaluateLimit");
const d1 = evaluateLimit({ count: 0, limit: 3, oldestMs: null, nowMs: 1000, windowMs: HOUR });
check("first request allowed, 2 remaining", d1.allowed && d1.remaining === 2 && d1.retryAfterSeconds === 0);
const d2 = evaluateLimit({ count: 2, limit: 3, oldestMs: 0, nowMs: 1000, windowMs: HOUR });
check("last request allowed, 0 remaining", d2.allowed && d2.remaining === 0);
const d3 = evaluateLimit({ count: 3, limit: 3, oldestMs: 0, nowMs: 10 * MIN, windowMs: HOUR });
check("over limit is blocked", !d3.allowed && d3.remaining === 0);
check("retry-after = when the oldest request leaves the window", d3.retryAfterSeconds === 50 * 60, String(d3.retryAfterSeconds));
const d4 = evaluateLimit({ count: 5, limit: 3, oldestMs: 0, nowMs: 2 * HOUR, windowMs: HOUR });
check("retry-after is never below 1 second", d4.retryAfterSeconds === 1);

console.log("describeWait");
check("seconds", describeWait(20) === "less than a minute");
check("minutes", describeWait(12 * 60) === "about 12 minutes" && describeWait(61) === "about 2 minutes");
check("one minute is singular", describeWait(60) === "about 1 minute");
check("hours", describeWait(3600) === "about 1 hour" && describeWait(2 * 3600) === "about 2 hours");

console.log("MemoryWindowCounter");
const mem = new MemoryWindowCounter();
mem.record("a", 0);
mem.record("a", 10 * MIN);
check("counts events in window", mem.snapshot("a", 20 * MIN, HOUR).count === 2);
check("reports oldest", mem.snapshot("a", 20 * MIN, HOUR).oldestMs === 0);
check("expires old events", mem.snapshot("a", 65 * MIN, HOUR).count === 1);
check("keys are independent", mem.snapshot("b", 20 * MIN, HOUR).count === 0);

console.log("getClientIpHash");
const h = (headers: Record<string, string>, salt = "s") => getClientIpHash(new Request("http://x", { headers }), salt);
check("same IP -> same hash", h({ "x-forwarded-for": "1.2.3.4" }) === h({ "x-forwarded-for": "1.2.3.4" }));
check("different IP -> different hash", h({ "x-forwarded-for": "1.2.3.4" }) !== h({ "x-forwarded-for": "5.6.7.8" }));
check("uses the first forwarded address", h({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }) === h({ "x-forwarded-for": "1.2.3.4" }));
check("falls back to x-real-ip", h({ "x-real-ip": "1.2.3.4" }) === h({ "x-forwarded-for": "1.2.3.4" }));
check("different salt -> different hash", h({ "x-forwarded-for": "1.2.3.4" }, "a") !== h({ "x-forwarded-for": "1.2.3.4" }, "b"));
check("never contains the raw IP", !h({ "x-forwarded-for": "1.2.3.4" }).includes("1.2.3.4") && h({ "x-forwarded-for": "1.2.3.4" }).length === 16);

// ---------------------------------------------------------------------------
// Guard (fake store, fake clock, fake identity)
// ---------------------------------------------------------------------------
type Row = UsageStart & { id: string; createdMs: number; finish?: UsageFinish };

function fakeStore(opts: { unavailable?: boolean; noInsert?: boolean } = {}) {
  const rows: Row[] = [];
  let clock = () => 0;
  const store: UsageStore = {
    async recentCount(actorKey, sinceMs, limit) {
      if (opts.unavailable) return null;
      const mine = rows.filter((r) => r.actorKey === actorKey && r.createdMs >= sinceMs).sort((a, b) => a.createdMs - b.createdMs).slice(0, limit);
      return { count: mine.length, oldestMs: mine.length ? mine[0].createdMs : null };
    },
    async start(entry) {
      if (opts.unavailable || opts.noInsert) return null;
      const row: Row = { ...entry, id: `row-${rows.length + 1}`, createdMs: clock() };
      rows.push(row);
      return row.id;
    },
    async finish(id, result) {
      const row = rows.find((r) => r.id === id);
      if (row) row.finish = result;
    },
  };
  return { store, rows, setClock: (fn: () => number) => (clock = fn) };
}

function makeGuard(opts: { storeOpts?: Parameters<typeof fakeStore>[0]; env?: Record<string, string> } = {}) {
  const fs = fakeStore(opts.storeOpts);
  let nowMs = 1_000_000;
  fs.setClock(() => nowMs);
  const guard = createAiGuard({
    store: fs.store,
    memory: new MemoryWindowCounter(),
    getConfig: () => getRateLimitConfig({ AI_RATE_LIMIT_USER_MAX: "3", AI_RATE_LIMIT_ANON_MAX: "2", ...(opts.env ?? {}) }),
    resolveIdentity: async (req) => {
      const user = req.headers.get("x-test-user");
      const denied = req.headers.get("x-test-deny");
      if (denied) throw new PersistenceError("UNAUTHORIZED", "Authentication required");
      return user
        ? { actor: { userId: user }, authenticated: true }
        : { actor: { userId: "00000000-0000-0000-0000-000000000001" }, authenticated: false };
    },
    now: () => nowMs,
    salt: "test",
  });
  return { guard, rows: fs.rows, advance: (ms: number) => (nowMs += ms) };
}

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/analyze", { method: "POST", headers });
const opts = { route: "analyze", model: "test-model" };

async function guardTests() {
  console.log("guard: signed-in users");
  {
    const { guard, rows } = makeGuard();
    for (let i = 1; i <= 3; i++) {
      const g = await guard(req({ "x-test-user": "u1" }), opts);
      check(`request ${i} of 3 allowed`, g.ok);
      if (g.ok) await g.tracker.finish(Response.json({ ok: true }));
    }
    const blocked = await guard(req({ "x-test-user": "u1" }), opts);
    check("4th request is blocked", !blocked.ok);
    if (!blocked.ok) {
      const body = await blocked.response.json();
      check("blocked with HTTP 429", blocked.response.status === 429);
      check("Retry-After header is set", Number(blocked.response.headers.get("Retry-After")) > 0);
      check("body has a readable string error (the UI shows it)", typeof body.error === "string" && body.error.includes("limit") && body.error.includes("3"), body.error);
      check("body has code RATE_LIMITED + retryAfterSeconds", body.code === "RATE_LIMITED" && body.retryAfterSeconds > 0);
    }
    check("blocked requests are not logged as usage", rows.length === 3);
    const other = await guard(req({ "x-test-user": "u2" }), opts);
    check("another user is unaffected", other.ok);
    check("usage is keyed by user and not marked demo", rows[0].actorKey === "user:u1" && rows[0].userId === "u1" && rows[0].isDemo === false);
    check("route and model are recorded", rows[0].route === "analyze" && rows[0].model === "test-model");
  }

  console.log("guard: window expiry");
  {
    const { guard, advance } = makeGuard();
    for (let i = 0; i < 3; i++) await guard(req({ "x-test-user": "u1" }), opts);
    check("blocked inside the window", !(await guard(req({ "x-test-user": "u1" }), opts)).ok);
    advance(61 * MIN);
    check("allowed again after the window passes", (await guard(req({ "x-test-user": "u1" }), opts)).ok);
  }

  console.log("guard: anonymous / demo callers");
  {
    const { guard, rows } = makeGuard();
    const a = { "x-forwarded-for": "1.1.1.1" };
    check("anon request 1 allowed", (await guard(req(a), opts)).ok);
    check("anon request 2 allowed", (await guard(req(a), opts)).ok);
    check("anon request 3 blocked (lower limit of 2)", !(await guard(req(a), opts)).ok);
    check("a different IP has its own allowance", (await guard(req({ "x-forwarded-for": "2.2.2.2" }), opts)).ok);
    check("anon usage keyed by hashed IP and marked demo", rows[0].actorKey.startsWith("ip:") && !rows[0].actorKey.includes("1.1.1.1") && rows[0].isDemo === true && rows[0].userId === null);
  }

  console.log("guard: usage outcomes");
  {
    const { guard, rows, advance } = makeGuard();
    let g = await guard(req({ "x-test-user": "u1" }), opts);
    if (g.ok) { advance(1234); await g.tracker.finish(Response.json({ message: "hi", actions: [] })); }
    check("success -> status ok with latency", rows[0].finish?.status === "ok" && rows[0].finish?.latencyMs === 1234 && rows[0].finish?.httpStatus === 200, JSON.stringify(rows[0].finish));

    g = await guard(req({ "x-test-user": "u1" }), opts);
    if (g.ok) await g.tracker.finish(Response.json({ error: "x" }, { status: 500 }));
    check("HTTP 500 -> status error", rows[1].finish?.status === "error" && rows[1].finish?.httpStatus === 500);

    g = await guard(req({ "x-test-user": "u1" }), opts);
    let timeoutResponse = Response.json({ message: "slow" }, { headers: { [AI_OUTCOME_HEADER]: "timeout" } });
    if (g.ok) await g.tracker.finish(timeoutResponse);
    check("timeout hint -> status timeout", rows[2].finish?.status === "timeout");
    check("outcome header is stripped before the client sees it", timeoutResponse.headers.get(AI_OUTCOME_HEADER) === null);

    const g2 = makeGuard();
    const gg = await g2.guard(req({ "x-test-user": "u1" }), opts);
    const unavailable = Response.json({ message: "down" }, { headers: { [AI_OUTCOME_HEADER]: "unavailable" } });
    if (gg.ok) await gg.tracker.finish(unavailable);
    check("unavailable hint -> status unavailable", g2.rows[0].finish?.status === "unavailable");
  }

  console.log("guard: authentication");
  {
    const { guard } = makeGuard();
    const g = await guard(req({ "x-test-deny": "1" }), opts);
    check("unauthenticated in production-like mode -> 401, not 429", !g.ok && g.response.status === 401);
  }

  console.log("guard: usage log unavailable (table missing / DB down)");
  {
    const { guard } = makeGuard({ storeOpts: { unavailable: true } });
    for (let i = 0; i < 3; i++) {
      const g = await guard(req({ "x-test-user": "u1" }), opts);
      if (g.ok) await g.tracker.finish(Response.json({}));
    }
    check("in-memory fallback still enforces the limit", !(await guard(req({ "x-test-user": "u1" }), opts)).ok);
    check("finish() with no log row does not throw", true);
  }
  {
    const { guard } = makeGuard({ storeOpts: { noInsert: true } });
    const g = await guard(req({ "x-test-user": "u1" }), opts);
    let threw = false;
    try { if (g.ok) await g.tracker.finish(Response.json({})); } catch { threw = true; }
    check("failed insert never breaks the request", g.ok && !threw);
  }

  console.log("guard: disabled");
  {
    const { guard, rows } = makeGuard({ env: { AI_RATE_LIMIT_DISABLED: "true" } });
    let allAllowed = true;
    for (let i = 0; i < 10; i++) {
      const g = await guard(req({ "x-test-user": "u1" }), opts);
      if (!g.ok) allAllowed = false;
    }
    check("never blocks when disabled", allAllowed);
    check("still logs usage when disabled", rows.length === 10);
  }
}

guardTests()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
