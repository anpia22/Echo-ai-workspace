/**
 * P0.3 — Observability: structured logger + redaction, AI error classification,
 * usage summary, health verdicts, health endpoint auth, error-code logging.
 *
 * Run: npx tsx scratch/test_p0_3_observability.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { REDACTED, createLogger, redact, type LogLevel } from "../src/app/lib/observability/logger";
import {
  DEFAULT_HEALTH_THRESHOLDS,
  classifyAiError,
  evaluateAiHealth,
  percentile,
  summarizeUsage,
  type UsageRow,
} from "../src/app/lib/observability/aiHealth";
import { isAuthorizedHealthRequest } from "../src/app/lib/observability/healthAuth";
import { AI_ERROR_CODE_HEADER, AI_OUTCOME_HEADER, createAiGuard } from "../src/app/lib/usage/aiGuard";
import { MemoryWindowCounter, getRateLimitConfig } from "../src/app/lib/usage/rateLimit";
import type { UsageFinish, UsageStart, UsageStore } from "../src/app/lib/usage/usageStore";

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
console.log("redact");
const r = redact({
  route: "analyze",
  token: "abc",
  Authorization: "Bearer xyz",
  password: "hunter2",
  email: "a@b.com",
  transcript: "my private idea",
  prompt: "secret prompt",
  content: "model said things",
  api_key: "k",
  service_role_key: "k2",
  nested: { cookie: "sb=1", ok: 1 },
}) as Record<string, unknown>;
check("keeps harmless fields", r.route === "analyze");
check("redacts token/auth/password/email", r.token === REDACTED && r.Authorization === REDACTED && r.password === REDACTED && r.email === REDACTED);
check("redacts transcript/prompt/content", r.transcript === REDACTED && r.prompt === REDACTED && r.content === REDACTED);
check("redacts api keys (snake_case)", r.api_key === REDACTED && r.service_role_key === REDACTED);
check("redacts inside nested objects", (r.nested as Record<string, unknown>).cookie === REDACTED && (r.nested as Record<string, unknown>).ok === 1);
check("does not leak values anywhere in the output", !JSON.stringify(r).match(/hunter2|private idea|secret prompt|model said|Bearer xyz|a@b\.com/));
check("errorMessage is NOT treated as sensitive", (redact({ errorMessage: "boom" }) as Record<string, unknown>).errorMessage === "boom");

const long = redact({ s: "x".repeat(1000) }) as { s: string };
check("truncates long strings", long.s.length < 400 && long.s.includes("[+"));
const arr = redact({ a: Array.from({ length: 100 }, (_, i) => i) }) as { a: unknown[] };
check("caps array length", arr.a.length === 21 && String(arr.a[20]).includes("80 more"));
const deep = JSON.stringify(redact({ a: { b: { c: { d: { e: { f: 1 } } } } } }));
check("bounds nesting depth", deep.includes("[truncated]"));
const err = redact({ error: new Error("kaboom") }) as { error: { name: string; message: string; stack: string } };
check("serializes Error objects", err.error.name === "Error" && err.error.message === "kaboom" && typeof err.error.stack === "string");
check("Error stack is bounded", err.error.stack.split(" | ").length <= 5);
check("handles null/undefined/functions", redact(null) === null && redact(undefined) === undefined && redact(() => 1) === undefined);
const circular: Record<string, unknown> = { name: "loop" };
circular.self = circular;
let circularOk = true;
try { redact(circular); } catch { circularOk = false; }
check("circular references do not crash or loop", circularOk);

// ---------------------------------------------------------------------------
console.log("logger");
function capture(opts: { level?: LogLevel; json?: boolean } = {}) {
  const lines: Array<{ level: LogLevel; line: string; record: Record<string, unknown> }> = [];
  const log = createLogger({ level: opts.level ?? "info", json: opts.json ?? true, now: () => Date.UTC(2026, 10, 8, 10, 0, 0), sink: (level, line, record) => lines.push({ level, line, record }) });
  return { log, lines };
}
{
  const { log, lines } = capture();
  log.info("ai.request.finished", { route: "analyze", latencyMs: 812, transcript: "private" });
  const parsed = JSON.parse(lines[0].line);
  check("emits one valid JSON line", lines.length === 1 && parsed.event === "ai.request.finished" && parsed.route === "analyze");
  check("adds ISO timestamp and level", parsed.ts === "2026-11-08T10:00:00.000Z" && parsed.level === "info");
  check("redacts sensitive fields in the emitted line", parsed.transcript === REDACTED && !lines[0].line.includes("private"));
}
{
  const { log, lines } = capture({ level: "warn" });
  log.debug("a"); log.info("b"); log.warn("c"); log.error("d");
  check("respects the minimum level", lines.map((l) => l.record.event).join() === "c,d");
}
{
  const { log, lines } = capture({ json: false });
  log.warn("usage.store_unavailable", { reason: "x" });
  check("readable format in development", lines[0].line.startsWith("[warn] usage.store_unavailable"));
}
{
  const log = createLogger({ level: "info", json: true, sink: () => { throw new Error("sink down"); } });
  let threw = false;
  try { log.info("x"); log.reportError(new Error("e")); } catch { threw = true; }
  check("a failing sink never throws into the request", !threw);
}
{
  const { log, lines } = capture();
  const seen: Array<{ error: unknown; context: Record<string, unknown> }> = [];
  log.setErrorReporter((error, context) => seen.push({ error, context }));
  log.setErrorReporter(() => { throw new Error("reporter down"); });
  const boom = new Error("boom");
  let threw = false;
  try { log.reportError(boom, { route: "analyze", token: "t0k" }); } catch { threw = true; }
  check("reportError logs a structured error event", lines.some((l) => l.record.event === "error.reported" && l.level === "error"));
  check("reportError forwards to registered reporters", seen.length === 1 && seen[0].error === boom);
  check("reporters receive redacted context", seen[0].context.token === REDACTED && seen[0].context.route === "analyze");
  check("a throwing reporter does not break the request", !threw);
}

// ---------------------------------------------------------------------------
console.log("classifyAiError");
check("401/403 -> provider_auth", classifyAiError({ status: 401 }) === "provider_auth" && classifyAiError({ status: 403 }) === "provider_auth");
check("429 -> provider_rate_limited", classifyAiError({ status: 429 }) === "provider_rate_limited");
check("5xx -> provider_server_error", classifyAiError({ status: 500 }) === "provider_server_error" && classifyAiError({ status: 502 }) === "provider_server_error");
check("other 4xx -> provider_bad_request", classifyAiError({ status: 400 }) === "provider_bad_request" && classifyAiError({ status: 422 }) === "provider_bad_request");
check("empty reply -> empty_response", classifyAiError(new Error("Empty AI response")) === "empty_response");
check("network errors -> network", classifyAiError({ code: "ECONNRESET" }) === "network" && classifyAiError({ code: "ENOTFOUND" }) === "network" && classifyAiError({ name: "APIConnectionError" }) === "network");
check("anything else -> internal", classifyAiError(new Error("???")) === "internal" && classifyAiError(null) === "internal" && classifyAiError("x") === "internal");

// ---------------------------------------------------------------------------
console.log("percentile");
const lat = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
check("p50 (nearest rank)", percentile(lat, 50) === 500);
check("p95 (nearest rank)", percentile(lat, 95) === 1000);
check("empty -> null", percentile([], 95) === null);
check("single value", percentile([42], 50) === 42 && percentile([42], 99) === 42);

// ---------------------------------------------------------------------------
console.log("summarizeUsage");
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const MIN = 60_000;
const row = (minsAgo: number, status: string, latency: number | null, code: string | null = null): UsageRow => ({
  created_at: new Date(NOW - minsAgo * MIN).toISOString(),
  status,
  latency_ms: latency,
  error_code: code,
});
const rows: UsageRow[] = [
  row(1, "ok", 1000), row(2, "ok", 2000), row(3, "ok", 3000, "unparseable_response"),
  row(4, "error", 500, "provider_server_error"), row(5, "timeout", 60000),
  row(6, "unavailable", 800, null), row(7, "pending", null),
  row(120, "ok", 1500), // outside a 15-minute window
];
const s = summarizeUsage(rows, NOW, 15 * MIN);
check("counts only rows inside the window", s.total === 7);
check("counts by status", s.ok === 3 && s.error === 1 && s.timeout === 1 && s.unavailable === 1 && s.pending === 1);
check("failure rate excludes pending", Math.abs(s.failureRate - 3 / 6) < 1e-9, String(s.failureRate));
check("counts 'ok but flagged' replies", s.degradedReplies === 1);
check("latency percentiles ignore pending rows", s.maxLatencyMs === 60000 && s.p50LatencyMs === 1000, JSON.stringify([s.p50LatencyMs, s.maxLatencyMs]));
check("top error codes sorted by count", s.topErrorCodes.length === 2 && s.topErrorCodes.every((c) => c.count === 1));
check("a wider window includes older rows", summarizeUsage(rows, NOW, 3 * 60 * MIN).total === 8);
const empty = summarizeUsage([], NOW, 15 * MIN);
check("empty input is safe", empty.total === 0 && empty.failureRate === 0 && empty.p95LatencyMs === null);

// ---------------------------------------------------------------------------
console.log("evaluateAiHealth");
const mk = (over: Partial<ReturnType<typeof summarizeUsage>>) => ({ ...empty, ...over });
check("too little data -> idle", evaluateAiHealth(mk({ total: 2 })).level === "idle");
check("pending requests do not count as data", evaluateAiHealth(mk({ total: 10, pending: 8 })).level === "idle");
check("healthy -> ok", evaluateAiHealth(mk({ total: 20, failureRate: 0.05, p95LatencyMs: 4000 })).level === "ok");
const deg = evaluateAiHealth(mk({ total: 20, failureRate: 0.25, p95LatencyMs: 4000 }));
check("20%+ failures -> degraded, with a reason", deg.level === "degraded" && deg.reasons[0].includes("25%"));
check("50%+ failures -> down", evaluateAiHealth(mk({ total: 20, failureRate: 0.6, p95LatencyMs: 4000 })).level === "down");
const slow = evaluateAiHealth(mk({ total: 20, failureRate: 0, p95LatencyMs: 45_000 }));
check("slow p95 -> degraded", slow.level === "degraded" && slow.reasons[0].includes("45.0s"));
check("slow + failing stays down", evaluateAiHealth(mk({ total: 20, failureRate: 0.7, p95LatencyMs: 45_000 })).level === "down");
check("thresholds are exposed and sane", DEFAULT_HEALTH_THRESHOLDS.minRequests === 5 && DEFAULT_HEALTH_THRESHOLDS.downFailureRate > DEFAULT_HEALTH_THRESHOLDS.degradedFailureRate);

// ---------------------------------------------------------------------------
console.log("health endpoint auth");
const TOKEN = "a-sufficiently-long-secret-token";
check("correct bearer token accepted", isAuthorizedHealthRequest(`Bearer ${TOKEN}`, TOKEN));
check("wrong token rejected", !isAuthorizedHealthRequest("Bearer nope-nope-nope-nope-nope", TOKEN));
check("missing header rejected", !isAuthorizedHealthRequest(null, TOKEN));
check("wrong scheme rejected", !isAuthorizedHealthRequest(`Basic ${TOKEN}`, TOKEN) && !isAuthorizedHealthRequest(TOKEN, TOKEN));
check("disabled when no token configured", !isAuthorizedHealthRequest(`Bearer ${TOKEN}`, undefined) && !isAuthorizedHealthRequest("Bearer ", ""));
check("disabled when token is too short (guessable)", !isAuthorizedHealthRequest("Bearer short", "short"));
check("a prefix of the token is rejected", !isAuthorizedHealthRequest(`Bearer ${TOKEN.slice(0, 20)}`, TOKEN));

// ---------------------------------------------------------------------------
console.log("guard: error codes reach the usage log");
async function guardTests() {
  const finished: Array<{ id: string; r: UsageFinish }> = [];
  const store: UsageStore = {
    async recentCount() { return { count: 0, oldestMs: null }; },
    async start(_e: UsageStart) { return "row-1"; },
    async finish(id, r) { finished.push({ id, r }); },
  };
  let t = 0;
  const guard = createAiGuard({
    store,
    memory: new MemoryWindowCounter(),
    getConfig: () => getRateLimitConfig({}),
    resolveIdentity: async () => ({ actor: { userId: "u1" }, authenticated: true }),
    now: () => (t += 100),
    salt: "s",
  });
  const g = await guard(new Request("http://x", { method: "POST" }), { route: "analyze", model: "m" });
  const response = Response.json({ message: "?", actions: [] }, { headers: { [AI_ERROR_CODE_HEADER]: "unparseable_response" } });
  if (g.ok) await g.tracker.finish(response);
  check("error code is stored with the usage row", finished[0]?.r.errorCode === "unparseable_response");
  check("an unparseable reply is still logged as ok (HTTP 200)", finished[0]?.r.status === "ok" && finished[0]?.r.httpStatus === 200);
  check("the code header is stripped before the client sees it", response.headers.get(AI_ERROR_CODE_HEADER) === null);

  const g2 = await guard(new Request("http://x", { method: "POST" }), { route: "analyze", model: "m" });
  const timeout = Response.json({}, { headers: { [AI_OUTCOME_HEADER]: "timeout" } });
  if (g2.ok) await g2.tracker.finish(timeout);
  check("responses without a code store none", finished[1]?.r.errorCode === undefined);
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
