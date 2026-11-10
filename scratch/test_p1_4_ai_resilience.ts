/**
 * P1.4 — AI failure handling: classification, bounded retries, optional fallback model,
 * and what the user is told. Uses a fake clock, so nothing here actually waits.
 *
 * Run: npx tsx scratch/test_p1_4_ai_resilience.ts
 */

import { readFileSync } from "node:fs";
import {
  AiCallFailed,
  classifyFailure,
  describeFailure,
  isRetryable,
  retryAfterSeconds,
  retryDelayMs,
  runWithResilience,
  type AiFailureKind,
} from "../src/app/lib/ai/resilience";

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

const err = (props: Record<string, unknown>, name = "Error") => Object.assign(new Error("provider said no"), { name }, props);

/** Fake clock: sleep advances time; attempts advance time by how long they "took". */
function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    sleeps,
    elapsed: () => t,
  };
}

async function outcome<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

async function main() {
  console.log("classification");
  const cases: Array<[string, unknown, AiFailureKind]> = [
    ["connection timeout", err({}, "APIConnectionTimeoutError"), "timeout"],
    ["429", err({ status: 429 }), "rate_limited"],
    ["500", err({ status: 500 }), "unavailable"],
    ["502", err({ status: 502 }), "unavailable"],
    ["503", err({ status: 503 }), "unavailable"],
    ["504", err({ status: 504 }), "unavailable"],
    ["401", err({ status: 401 }), "auth"],
    ["403", err({ status: 403 }), "auth"],
    ["400", err({ status: 400 }), "bad_request"],
    ["422", err({ status: 422 }), "bad_request"],
    ["connection error", err({}, "APIConnectionError"), "network"],
    ["ECONNRESET", err({ code: "ECONNRESET" }), "network"],
    ["plain Error", new Error("x"), "other"],
    ["null", null, "other"],
  ];
  for (const [label, e, kind] of cases) check(`${label} -> ${kind}`, classifyFailure(e) === kind);
  check("only transient kinds are retryable", (["timeout", "rate_limited", "unavailable", "network"] as const).every(isRetryable) && !(["auth", "bad_request", "other"] as const).some(isRetryable));

  console.log("retry timing");
  check("retry-after seconds read from a Headers object", retryAfterSeconds({ headers: new Headers({ "retry-after": "2" }) }) === 2);
  check("retry-after read from a plain object", retryAfterSeconds({ headers: { "retry-after": "4" } }) === 4);
  check("missing or junk retry-after -> null", retryAfterSeconds({}) === null && retryAfterSeconds({ headers: { "retry-after": "soon" } }) === null);
  check("backoff grows and carries jitter", retryDelayMs(0, null, () => 0) === 500 && retryDelayMs(1, null, () => 0) === 1000 && retryDelayMs(0, null, () => 0.99) < 750);
  check("backoff is capped at 3 s", retryDelayMs(10, null, () => 0.99) === 3000);
  check("provider retry-after is honoured but capped", retryDelayMs(0, 2) === 2000 && retryDelayMs(0, 120) === 3000);

  console.log("success paths");
  let c = clock();
  let calls = 0;
  const first = await runWithResilience({ primary: async () => (calls++, "ok"), now: c.now, sleep: c.sleep, random: () => 0 });
  check("first-try success: one attempt, no waiting", first.value === "ok" && first.attempts === 1 && !first.usedFallback && c.sleeps.length === 0);

  c = clock();
  calls = 0;
  const retried = await runWithResilience({
    primary: async () => { if (calls++ === 0) throw err({ status: 503 }); return "ok"; },
    now: c.now, sleep: c.sleep, random: () => 0,
  });
  check("a 503 is retried and then succeeds", retried.value === "ok" && retried.attempts === 2 && c.sleeps.length === 1 && c.sleeps[0] === 500);

  c = clock();
  calls = 0;
  const limited = await runWithResilience({
    primary: async () => { if (calls++ === 0) throw err({ status: 429, headers: { "retry-after": "2" } }); return "ok"; },
    now: c.now, sleep: c.sleep, random: () => 0,
  });
  check("a 429 waits for the provider's Retry-After", limited.attempts === 2 && c.sleeps[0] === 2000);

  console.log("failure paths");
  for (const [label, e, kind] of [["401", err({ status: 401 }), "auth"], ["400", err({ status: 400 }), "bad_request"], ["unknown", new Error("boom"), "other"]] as const) {
    c = clock();
    calls = 0;
    const r = await outcome(runWithResilience({ primary: async () => { calls++; throw e; }, now: c.now, sleep: c.sleep }));
    check(`${label}: no retry, fails at once as ${kind}`, !r.ok && r.error instanceof AiCallFailed && r.error.kind === kind && calls === 1 && c.sleeps.length === 0);
  }

  c = clock();
  calls = 0;
  const exhausted = await outcome(runWithResilience({ primary: async () => { calls++; throw err({ status: 503 }); }, now: c.now, sleep: c.sleep, random: () => 0 }));
  check("persistent 503: 1 try + 2 retries, then AiCallFailed", !exhausted.ok && exhausted.error instanceof AiCallFailed && exhausted.error.kind === "unavailable" && exhausted.error.attempts === 3 && calls === 3);
  check("AiCallFailed keeps the original error for logs", !exhausted.ok && (exhausted.error as AiCallFailed).cause instanceof Error);

  console.log("time budget (never hangs)");
  c = clock();
  const timeouts: number[] = [];
  const slow = await outcome(runWithResilience({
    primary: async (timeoutMs) => { timeouts.push(timeoutMs); c.advance(timeoutMs); throw err({}, "APIConnectionTimeoutError"); },
    now: c.now, sleep: c.sleep, random: () => 0,
  }));
  check("repeated timeouts end as a timeout failure", !slow.ok && (slow.error as AiCallFailed).kind === "timeout");
  check("total time never exceeds the 55 s budget", c.elapsed() <= 55_000, `elapsed=${c.elapsed()}`);
  check("first attempt gets the 40 s cap; later attempts get only what is left", timeouts[0] === 40_000 && timeouts.slice(1).every((t) => t < 40_000), JSON.stringify(timeouts));
  check("no attempt starts with under 6 s left", timeouts.every((t, i) => i === 0 || t >= 6_000 - 1), JSON.stringify(timeouts));

  c = clock();
  calls = 0;
  const tight = await outcome(runWithResilience({
    primary: async () => { calls++; c.advance(52_000); throw err({ status: 503 }); },
    now: c.now, sleep: c.sleep, random: () => 0,
  }));
  check("a slow first failure leaves no room: no retry", !tight.ok && calls === 1 && c.sleeps.length === 0);

  console.log("fallback model");
  c = clock();
  let fallbackCalls = 0;
  const viaFallback = await runWithResilience({
    primary: async () => { throw err({ status: 503 }); },
    fallback: async () => { fallbackCalls++; return "from-fallback"; },
    now: c.now, sleep: c.sleep, random: () => 0,
  });
  check("fallback runs after the primary is exhausted", viaFallback.value === "from-fallback" && viaFallback.usedFallback && viaFallback.attempts === 4 && fallbackCalls === 1);

  fallbackCalls = 0;
  const noFallbackOnAuth = await outcome(runWithResilience({
    primary: async () => { throw err({ status: 401 }); },
    fallback: async () => { fallbackCalls++; return "x"; },
    now: clock().now, sleep: clock().sleep,
  }));
  check("auth/bad-request failures do not use the fallback", !noFallbackOnAuth.ok && fallbackCalls === 0);

  const fallbackFails = await outcome(runWithResilience({
    primary: async () => { throw err({ status: 503 }); },
    fallback: async () => { throw err({ status: 500 }); },
    now: clock().now, sleep: clock().sleep, random: () => 0,
  }));
  check("if the fallback also fails, the primary's failure is reported", !fallbackFails.ok && (fallbackFails.error as AiCallFailed).kind === "unavailable");

  c = clock();
  fallbackCalls = 0;
  await outcome(runWithResilience({
    primary: async () => { c.advance(53_000); throw err({ status: 503 }); },
    fallback: async () => { fallbackCalls++; return "x"; },
    now: c.now, sleep: c.sleep, random: () => 0,
  }));
  check("fallback is skipped when the budget is spent", fallbackCalls === 0);

  console.log("what the user is told");
  const expected: Array<[AiFailureKind, number, boolean]> = [
    ["timeout", 504, true], ["rate_limited", 503, true], ["unavailable", 503, true],
    ["network", 503, true], ["auth", 500, false], ["bad_request", 500, false], ["other", 500, false],
  ];
  for (const [kind, status, retryable] of expected) {
    const d = describeFailure(kind);
    check(`${kind}: HTTP ${status}, retryable=${retryable}`, d.status === status && d.retryable === retryable && d.message.length > 10);
  }
  const allMessages = (["timeout", "rate_limited", "unavailable", "network", "auth", "bad_request", "other"] as const).map((k) => describeFailure(k).message).join(" | ");
  check("messages never mention providers, keys or status codes", !/nvidia|nemotron|api key|401|403|429|500|503|openai/i.test(allMessages));
  check("transient failures suggest when to retry; permanent ones do not", describeFailure("timeout").retryAfterSeconds !== undefined && describeFailure("other").retryAfterSeconds === undefined);

  console.log("wiring in /api/analyze");
  const route = readFileSync(new URL("../src/app/api/analyze/route.ts", import.meta.url), "utf8");
  check("route calls the model through the resilience wrapper", /callAnalyzeModel\(\(model, timeoutMs\)/.test(route) && /runWithResilience\(/.test(route));
  check("old single-retry helper is gone", !/withSingle503Retry|NVIDIA_503_RETRY_DELAY_MS|NVIDIA_REQUEST_TIMEOUT_MS/.test(route));
  check("per-attempt timeout comes from the wrapper", /timeout: timeoutMs/.test(route));
  check("fallback model is opt-in via ANALYZE_FALLBACK_MODEL", /ANALYZE_FALLBACK_MODEL\?\.trim\(\) \|\| null/.test(route));
  const catchBlock = route.slice(route.indexOf("// P1.4: classify the failure"));
  check("error responses no longer echo provider message, name or status", !/error\?\.message|error\?\.name|error\?\.status|name: error|status: error/.test(catchBlock));
  check("provider detail only outside production", /NODE_ENV !== "production"/.test(catchBlock));
  check("timeout/unavailable outcome headers still reach the usage log", /AI_OUTCOME_HEADER\] = "timeout"/.test(catchBlock) && /AI_OUTCOME_HEADER\] = "unavailable"/.test(catchBlock));
  check("Retry-After header is sent on transient failures", /Retry-After/.test(catchBlock));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
