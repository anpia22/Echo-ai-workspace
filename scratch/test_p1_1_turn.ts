/**
 * P1.1 — TURN/STUN configuration for WebRTC: provider handling, safety, and client wiring.
 * Providers are faked; nothing here touches the network.
 *
 * Run: npx tsx scratch/test_p1_1_turn.ts
 */

import { readFileSync } from "node:fs";
import {
  CLOUDFLARE_CREDENTIAL_TTL_S,
  PUBLIC_STUN,
  loadIceServers,
  parseTurnUrls,
  sanitizeIceServers,
} from "../src/app/lib/webrtc/iceServers";
import { createDefaultRtcConfiguration, setRuntimeIceServers } from "../src/app/lib/collaboration/meeting/mediaLifecycle";

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

const relayOf = (r: { iceServers: Array<{ urls: string | string[] }> }) =>
  r.iceServers.some((s) => [s.urls].flat().some((u) => /^turns?:/i.test(u)));

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };
function fakeFetch(respond: () => { ok: boolean; status: number; body?: unknown } | Error) {
  const calls: Call[] = [];
  const fn = async (url: string, init: Call["init"] & { signal: AbortSignal }) => {
    calls.push({ url, init });
    const r = respond();
    if (r instanceof Error) throw r;
    return { ok: r.ok, status: r.status, json: async () => r.body };
  };
  return { fn, calls };
}

const CF_OK = {
  iceServers: [
    {
      urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
      username: "cf-user",
      credential: "cf-secret-credential",
    },
  ],
};

async function main() {
  console.log("parsing");
  check("valid turn/turns urls kept, junk dropped", (() => {
    const u = parseTurnUrls("turn:a.example.com:3478, turns:a.example.com:443 ,http://evil.example, javascript:alert(1), ,turn:");
    return u.length === 2 && u[0] === "turn:a.example.com:3478" && u[1] === "turns:a.example.com:443";
  })());
  check("empty or missing TURN_URLS -> none", parseTurnUrls(undefined).length === 0 && parseTurnUrls("  ").length === 0);
  check("sanitize drops non-array / non-object / bad urls", sanitizeIceServers("x").length === 0 && sanitizeIceServers([null, 5, { urls: "http://x" }]).length === 0);
  check("sanitize drops a relay without credentials", sanitizeIceServers([{ urls: "turn:a.example.com:3478" }]).length === 0);
  check("sanitize keeps stun without credentials", sanitizeIceServers([{ urls: "stun:s.example.com:3478" }]).length === 1);
  check("sanitize keeps a complete relay entry", sanitizeIceServers([{ urls: ["turn:a.example.com:3478"], username: "u", credential: "c" }])[0].username === "u");

  console.log("no configuration");
  const none = await loadIceServers({});
  check("no env -> public STUN only (same as before)", none.source === "stun-only" && none.iceServers.length === 1 && none.iceServers[0] === PUBLIC_STUN && !relayOf(none));
  check("half-configured Cloudflare (no token) is ignored", (await loadIceServers({ CLOUDFLARE_TURN_KEY_ID: "id" })).source === "stun-only");
  check("half-configured static (no credential) is ignored", (await loadIceServers({ TURN_URLS: "turn:a.example.com:3478", TURN_USERNAME: "u" })).source === "stun-only");
  check("static with only stun urls is not a relay", (await loadIceServers({ TURN_URLS: "stun:a.example.com:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" })).source === "stun-only");

  console.log("static credentials (any provider / own coturn)");
  const stat = await loadIceServers({ TURN_URLS: "turn:t.example.com:3478,turns:t.example.com:443", TURN_USERNAME: "alice", TURN_CREDENTIAL: "pw" });
  check("static -> STUN plus one relay entry", stat.source === "static" && relayOf(stat) && stat.iceServers[0] === PUBLIC_STUN);
  check("static relay carries the username and credential", stat.iceServers[1].username === "alice" && stat.iceServers[1].credential === "pw");

  console.log("Cloudflare Realtime TURN");
  let f = fakeFetch(() => ({ ok: true, status: 200, body: CF_OK }));
  const cf = await loadIceServers({ CLOUDFLARE_TURN_KEY_ID: "key id/1", CLOUDFLARE_TURN_API_TOKEN: "api-token" }, f.fn);
  check("success -> relay available, source cloudflare", cf.source === "cloudflare" && relayOf(cf));
  check("public STUN is kept alongside the relay", cf.iceServers[0] === PUBLIC_STUN);
  check("request goes to Cloudflare's generate-ice-servers endpoint, id encoded", f.calls.length === 1 && f.calls[0].url === "https://rtc.live.cloudflare.com/v1/turn/keys/key%20id%2F1/credentials/generate-ice-servers" && f.calls[0].init.method === "POST");
  check("API token is sent as a Bearer header, not in the url", f.calls[0].init.headers.Authorization === "Bearer api-token" && !f.calls[0].url.includes("api-token"));
  check("requested credential lifetime is one day", JSON.parse(f.calls[0].init.body).ttl === CLOUDFLARE_CREDENTIAL_TTL_S);
  check("the API token never appears in the result", !JSON.stringify(cf).includes("api-token"));
  check("Cloudflare wins over static settings", (await loadIceServers({ CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t", TURN_URLS: "turn:t.example.com:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" }, f.fn)).source === "cloudflare");

  const warnings: string[] = [];
  const warn = (event: string, fields: Record<string, unknown>) => warnings.push(event + JSON.stringify(fields));
  const cfEnv = { CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "super-secret-token" };

  f = fakeFetch(() => ({ ok: false, status: 401 }));
  const denied = await loadIceServers(cfEnv, f.fn, warn);
  check("provider error -> STUN only, call still works", denied.source === "stun-only" && !relayOf(denied));
  f = fakeFetch(() => new Error("socket hang up"));
  check("unreachable provider -> STUN only", (await loadIceServers(cfEnv, f.fn, warn)).source === "stun-only");
  f = fakeFetch(() => ({ ok: true, status: 200, body: { iceServers: [{ urls: "stun:only.example.com:3478" }] } }));
  check("response without a relay -> STUN only", (await loadIceServers(cfEnv, f.fn, warn)).source === "stun-only");
  f = fakeFetch(() => ({ ok: true, status: 200, body: "garbage" }));
  check("malformed response -> STUN only", (await loadIceServers(cfEnv, f.fn, warn)).source === "stun-only");
  check("failures are logged without leaking the token", warnings.length === 4 && !warnings.join(" ").includes("super-secret-token"));

  console.log("client configuration");
  const baseline = createDefaultRtcConfiguration();
  check("default config is public STUN before anything loads", JSON.stringify(baseline.iceServers).includes("stun.l.google.com") && !JSON.stringify(baseline.iceServers).includes("turn:"));
  setRuntimeIceServers(cf.iceServers as RTCIceServer[]);
  check("loaded servers are used for new connections", JSON.stringify(createDefaultRtcConfiguration().iceServers).includes("turn.cloudflare.com"));
  check("candidate pool setting is preserved", createDefaultRtcConfiguration().iceCandidatePoolSize === 10);
  setRuntimeIceServers([]);
  check("an empty list falls back to public STUN", JSON.stringify(createDefaultRtcConfiguration().iceServers).includes("stun.l.google.com"));
  setRuntimeIceServers(null);

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const route = read("src/app/api/webrtc/ice/route.ts");
  check("route requires an identity before returning credentials", route.indexOf("resolveServerActor(request)") !== -1 && route.indexOf("resolveServerActor(request)") < route.indexOf("loadIceServers("));
  check("route is never cached", (route.match(/no-store/g) ?? []).length >= 2 && /force-dynamic/.test(route));
  check("route does not return the API token or env values", !/CLOUDFLARE_TURN_API_TOKEN[^,\n]*\)\s*[,}]?\s*\n\s*\)/.test(route) && !/json\(\{[^}]*process\.env/.test(route));
  const client = read("src/app/lib/webrtc/iceServersClient.ts");
  check("client stops retrying when signed out (401/403)", /status === 401 \|\| res\.status === 403/.test(client) && /=== "denied"\) return/.test(client));
  const page = read("src/app/app/page.tsx");
  check("app starts the ICE refresh", /startIceServerRefresh\(\)/.test(page));
  const runtime = read("src/app/lib/collaboration/meeting/meetingRuntime.ts");
  check("both peer-connection sites use the shared configuration", (runtime.match(/createDefaultRtcConfiguration\(\)/g) ?? []).length >= 2);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
