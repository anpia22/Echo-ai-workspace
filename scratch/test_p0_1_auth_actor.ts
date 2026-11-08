/**
 * P0.1 — Server actor resolution (cookie session + production fallback rules)
 *
 * Uses dummy Supabase config; no live network calls are made because none of the
 * cases below carry a decodable session.
 *
 * Run: npx tsx scratch/test_p0_1_auth_actor.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { resolveServerActor } from "../src/app/lib/persistence/server/auth";

const env = process.env as Record<string, string | undefined>;
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

async function rejects(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const DEV_ID = "00000000-0000-0000-0000-000000000001";
const reqNoCookie = new Request("http://localhost/api/workspace");
const reqGarbageCookie = new Request("http://localhost/api/workspace", {
  headers: { cookie: "theme=dark; sb-dummy-project-auth-token=not-a-real-session" },
});
const reqUnrelatedCookie = new Request("http://localhost/api/workspace", {
  headers: { cookie: "theme=dark; foo=bar" },
});

async function main() {
  console.log("Non-production");
  env.NODE_ENV = "development";
  delete env.ECHO_DEMO_MODE;
  delete env.ECHO_DEV_USER_ID;
  check("no request -> dev actor", (await resolveServerActor()).userId === DEV_ID);
  check("no cookie -> dev actor", (await resolveServerActor(reqNoCookie)).userId === DEV_ID);
  check("garbage session cookie -> dev actor (never trusted)", (await resolveServerActor(reqGarbageCookie)).userId === DEV_ID);

  console.log("Production, demo mode OFF");
  env.NODE_ENV = "production";
  delete env.ECHO_DEMO_MODE;
  for (const [label, req] of [
    ["no request", undefined],
    ["no cookie", reqNoCookie],
    ["unrelated cookie", reqUnrelatedCookie],
    ["garbage session cookie", reqGarbageCookie],
  ] as const) {
    const err = await rejects(() => resolveServerActor(req));
    check(`${label} -> Authentication required`, !!err && err.includes("Authentication required"), `got: ${err}`);
  }

  console.log("Production, demo mode ON");
  env.ECHO_DEMO_MODE = "true";
  check("no cookie -> shared demo actor", (await resolveServerActor(reqNoCookie)).userId === DEV_ID);
  check("garbage cookie -> shared demo actor", (await resolveServerActor(reqGarbageCookie)).userId === DEV_ID);

  console.log("Production, demo mode set to a non-'true' value");
  env.ECHO_DEMO_MODE = "false";
  const err = await rejects(() => resolveServerActor(reqNoCookie));
  check("ECHO_DEMO_MODE=false -> Authentication required", !!err && err.includes("Authentication required"), `got: ${err}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
