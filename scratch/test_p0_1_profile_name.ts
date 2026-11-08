/**
 * P0.1 — Display name rules, cache and participant override
 *
 * Run: npx tsx scratch/test_p0_1_profile_name.ts
 */

// Minimal browser storage shims (participant.ts and profileName.ts are client code)
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}
const local = makeStorage();
const session = makeStorage();
const g = globalThis as Record<string, unknown>;
g.window = { localStorage: local, sessionStorage: session };
g.sessionStorage = session;
g.localStorage = local;

import {
  validateDisplayName,
  suggestDisplayName,
  getCachedDisplayName,
  setCachedDisplayName,
  clearProfileCache,
  PROFILE_NAME_CACHE_KEY,
} from "../src/lib/profileName";
import { getOrCreateParticipant } from "../src/app/lib/collaboration/participant";

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

console.log("validateDisplayName");
const v = (s: unknown) => validateDisplayName(s);
check("accepts a normal name", v("Alex Morgan").ok && (v("Alex Morgan") as { value: string }).value === "Alex Morgan");
check("trims and collapses whitespace", (v("  Alex    Morgan  ") as { value: string }).value === "Alex Morgan");
check("collapses newlines/tabs to a space", (v("Alex\n\tMorgan") as { value: string }).value === "Alex Morgan");
check("rejects empty", !v("").ok);
check("rejects whitespace only", !v("     ").ok);
check("rejects 1 character", !v("A").ok);
check("accepts 2 characters", v("Al").ok);
check("accepts exactly 30 characters", v("a".repeat(30)).ok);
check("rejects 31 characters", !v("a".repeat(31)).ok);
check("counts emoji as one character each", v("😀".repeat(30)).ok && !v("😀".repeat(31)).ok);
check("rejects angle brackets", !v("<b>Alex</b>").ok);
check("rejects control characters", !v("Alex\u0000Morgan").ok);
check("rejects invisible direction overrides", !v("Alex‮Morgan").ok);
check("rejects non-strings", !v(undefined).ok && !v(42).ok && !v(null).ok);
check("allows unicode letters", v("José Núñez").ok && v("李雷").ok);

console.log("suggestDisplayName");
check("prefers saved display name", suggestDisplayName({ displayName: "Sam", fullName: "Samuel Jones", email: "x@y.com" }) === "Sam");
check("falls back to OAuth full name", suggestDisplayName({ fullName: "Samuel Jones", email: "x@y.com" }) === "Samuel Jones");
check("falls back to email prefix, never the address", suggestDisplayName({ email: "jane.doe@example.com" }) === "jane doe");
check("returns empty string when nothing usable", suggestDisplayName({ email: "a@b.com" }) === "");

console.log("cache");
check("empty cache -> null", getCachedDisplayName() === null);
setCachedDisplayName("Alex Morgan");
check("round-trips a name", getCachedDisplayName() === "Alex Morgan");
local.setItem(PROFILE_NAME_CACHE_KEY, "<script>");
check("ignores an invalid cached value", getCachedDisplayName() === null);

console.log("participant override");
local.clear();
session.clear();
const anonymous = getOrCreateParticipant();
check("without a profile, keeps the generated name", /^User \d{4}$/.test(anonymous.displayName), anonymous.displayName);

setCachedDisplayName("Alex Morgan");
const named = getOrCreateParticipant();
check("with a profile, uses the chosen name", named.displayName === "Alex Morgan", named.displayName);
check("keeps the same presence userId and color", named.userId === anonymous.userId && named.color === anonymous.color);

setCachedDisplayName("Alexandra");
check("a renamed profile updates an existing participant", getOrCreateParticipant().displayName === "Alexandra");

console.log("sign-out");
clearProfileCache();
check("clears the cached name", getCachedDisplayName() === null);
check("clears the per-tab participant", session.getItem("echo.collaboration.participant") === null);
const fresh = getOrCreateParticipant();
check("next visitor gets a fresh anonymous identity", /^User \d{4}$/.test(fresh.displayName) && fresh.userId !== anonymous.userId, fresh.displayName);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
