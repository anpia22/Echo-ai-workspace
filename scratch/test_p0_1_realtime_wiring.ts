/**
 * P0.1 — Live-sync channel access: the app side matches the database rules.
 *
 * The database (migration 20261110010000) only admits signed-in workspace members to channels
 * named echo-room:<workspace uuid>:<room id>. These checks make sure the app generates exactly
 * those names, joins them as PRIVATE channels, never lets a signed-in user fall back to the
 * public channel, and keeps ?workspace= in shared room links.
 *
 * Run: npx tsx scratch/test_p0_1_realtime_wiring.ts
 */

import { readFileSync } from "node:fs";
import {
  buildRoomPath,
  buildRoomUrl,
  createRoomId,
  getRoomChannelName,
  getSecureRoomChannelName,
} from "../src/app/lib/collaboration/room";

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

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const WS = "123e4567-e89b-42d3-a456-426614174000";

console.log("channel names");
const room = createRoomId();
const secure = getSecureRoomChannelName(WS, room);
check("secure name is echo-room:<workspace>:<room>", secure === `echo-room:${WS}:${room}`);
check("legacy name is unchanged (still used by demo mode)", getRoomChannelName(room) === `echo-room:${room}`);

// The exact pattern the SQL function echo_room_workspace_id accepts.
const sql = read("supabase/migrations/20261110010000_p0_1_realtime_authorization.sql");
const patternInSql = /p_topic ~\* '([^']+)'/.exec(sql)?.[1] ?? "";
const asJs = new RegExp(patternInSql.replace("[^:[:space:]]", "[^:\\s]"), "i");
check("the SQL pattern was found", patternInSql.length > 20);
check("a generated secure name is accepted by the SQL pattern", asJs.test(secure));
check("the legacy name is rejected by the SQL pattern", !asJs.test(getRoomChannelName(room)));
check("a name with another workspace's id is still a different topic", getSecureRoomChannelName("99999999-9999-4999-8999-999999999999", room) !== secure);

console.log("room links");
check("a copied link keeps ?workspace=", (() => {
  const url = new URL(buildRoomUrl(room, "https://echo.example", `?workspace=${WS}`));
  return url.searchParams.get("workspace") === WS && url.searchParams.get("room") === room && url.pathname === "/app";
})());
check("a link built without a search still works as before", buildRoomUrl(room, "https://echo.example") === `https://echo.example/app?room=${room}`);
check("creating a room keeps ?workspace= in the path", buildRoomPath(room, `?workspace=${WS}`).includes(`workspace=${WS}`));
check("the Copy link button passes the current search", /buildRoomUrl\(\s*roomId,\s*undefined,\s*typeof window !== "undefined" \? window\.location\.search : undefined/.test(read("src/app/components/RoomControls.tsx")));

console.log("how the app joins");
const hook = read("src/app/lib/collaboration/useRoomChannel.ts");
check("channels are private for signed-in users", /private: secureChannel/.test(hook));
check("secure mode = signed in AND a workspace is known", /const secureChannel = realtimeAuth === "authed" && workspaceId !== null/.test(hook));
check("signed-in users use the secure channel name", /secureChannel && workspaceId !== null\s*\?\s*getSecureRoomChannelName\(workspaceId, roomId\)/.test(hook));
check("it waits for the sign-in state instead of guessing", /realtimeAuth === "unknown"/.test(hook));
check("a signed-in user with no workspace yet does NOT join the public channel", /realtimeAuth === "authed" && workspaceId === null\)\) \{\s*return;/.test(hook));
check("the channel is re-created when auth or workspace changes", /\}, \[roomId, realtimeAuth, workspaceId, secureChannel\]\);/.test(hook));
check("the page passes the workspace id", /\}, \{ workspaceId: workspaceHydration\.workspaceId \}\);/.test(read("src/app/app/page.tsx")));

console.log("the browser connection carries the user's session");
const client = read("src/app/lib/collaboration/supabase.ts");
check("uses the cookie-session client", /createBrowserClient\(config\.url, config\.anonKey\)/.test(client));
check("no longer an anonymous client without a session", !/persistSession: false/.test(client) && !/import \{ createClient/.test(client));

console.log("migration");
check("receive and send are both restricted to workspace members", (sql.match(/is_workspace_member\(public\.echo_room_workspace_id\(realtime\.topic\(\)\)\)/g) ?? []).length === 2);
check("only signed-in users get a policy (anonymous gets none)", (sql.match(/TO authenticated/g) ?? []).length === 2 && !/TO anon|TO public/i.test(sql));
check("only broadcast and presence are allowed", (sql.match(/extension IN \('broadcast', 'presence'\)/g) ?? []).length === 2);
check("the dashboard step is documented in the migration", /Allow public access/.test(sql));
check("runs in one transaction and can be re-run", /^BEGIN;/m.test(sql) && /^COMMIT;/m.test(sql) && (sql.match(/DROP POLICY IF EXISTS/g) ?? []).length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
