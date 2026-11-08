/**
 * One-off live check of the health endpoints against the real database (read-only).
 * Prints counts and verdicts only. Run:
 *   npx tsx --env-file=.env.local scratch/live_check_p0_3_health.ts
 */

process.env.HEALTH_CHECK_TOKEN = "live-check-temporary-token-123456";

import { GET as healthAi } from "../src/app/api/health/ai/route";
import { GET as health } from "../src/app/api/health/route";

async function main() {
  const pub = await health();
  console.log("GET /api/health ->", pub.status, JSON.stringify(await pub.json()));

  const noAuth = await healthAi(new Request("http://localhost/api/health/ai"));
  console.log("GET /api/health/ai (no token) ->", noAuth.status);

  const wrong = await healthAi(new Request("http://localhost/api/health/ai", { headers: { authorization: "Bearer wrong-wrong-wrong-wrong" } }));
  console.log("GET /api/health/ai (wrong token) ->", wrong.status);

  const ok = await healthAi(new Request("http://localhost/api/health/ai", { headers: { authorization: `Bearer ${process.env.HEALTH_CHECK_TOKEN}` } }));
  const body = await ok.json();
  console.log("GET /api/health/ai (valid token) ->", ok.status);
  if (ok.status === 200) {
    for (const key of ["last15Minutes", "last24Hours"] as const) {
      const s = body[key].summary;
      console.log(
        `  ${key}: total=${s.total} ok=${s.ok} error=${s.error} timeout=${s.timeout} unavailable=${s.unavailable} pending=${s.pending}` +
          ` failureRate=${s.failureRate} p50=${s.p50LatencyMs} p95=${s.p95LatencyMs} verdict=${body[key].verdict.level}`
      );
    }
    console.log("  truncated:", body.truncated);
  } else {
    console.log("  body:", JSON.stringify(body));
  }
}

main().catch((e) => {
  console.error("live check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
