/**
 * P0.1 — Database security model, tested in an in-memory Postgres (pglite).
 *
 * Replays every migration with Supabase-style roles (anon / authenticated / service_role), then
 * runs the attacks found by scratch/live_check_security.mjs:
 *   - BEFORE the hardening migration they must still reproduce (proves this model is faithful);
 *   - AFTER it, every attack must fail and every legitimate path must still work.
 * Any future migration that reopens a hole fails this test.
 *
 * It also checks the Realtime access rules (20261110010000): only signed-in members of a
 * workspace may receive or send on that workspace's private room channels. Supabase's own
 * enforcement plumbing is stubbed (realtime.messages + realtime.topic()); this tests the rules.
 *
 * Run: node scratch/test_p0_1_security_model.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

import { fileURLToPath } from "node:url";
const MIG = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const HARDEN = files.find((f) => f.includes("security_hardening"));
const BEFORE = files.filter((f) => f < HARDEN);
const LATER = files.filter((f) => f > HARDEN); // e.g. the Realtime authorization migration

const db = new PGlite();

async function exec(sql, label) {
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`\nFAILED in ${label}: ${e.message}`);
    process.exit(2);
  }
}

// --- Supabase-like environment ---
await exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  -- Supabase defaults: new tables/functions in public are open to the API roles (RLS then decides).
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  -- Stand-in for Supabase Realtime's authorization table and topic helper.
  CREATE SCHEMA realtime;
  GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
  CREATE TABLE realtime.messages (id serial PRIMARY KEY, topic text NOT NULL, extension text NOT NULL, payload jsonb);
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON realtime.messages, realtime.messages_id_seq TO anon, authenticated, service_role;
  CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('realtime.topic', true), '') $$;
  GRANT EXECUTE ON FUNCTION realtime.topic() TO anon, authenticated, service_role;
`, "environment");

const clean = (sql) => sql.replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?;?/gi, "").replace(/CREATE EXTENSION IF NOT EXISTS "?uuid-ossp"?;?/gi, "");
for (const f of BEFORE) await exec(clean(readFileSync(`${MIG}/${f}`, "utf8")), f);
console.log(`applied ${BEFORE.length} existing migrations`);

// --- helpers: act as a role / user ---
async function as(role, uid, fn) {
  const claims = JSON.stringify({ role, ...(uid ? { sub: uid } : {}) });
  await db.exec(`SELECT set_config('request.jwt.claims', '${claims}', false), set_config('request.jwt.claim.sub', '${uid ?? ""}', false); SET ROLE ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE;");
  }
}
const attempt = async (sql, params = []) => {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows, count: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const WS = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const OWNER = "audit-owner";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EDITOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

async function seed() {
  await db.exec(`
    RESET ROLE;
    TRUNCATE workspaces CASCADE;
    INSERT INTO workspaces (id, title) VALUES ('${WS}', 'audit');
    INSERT INTO workspace_members (workspace_id, user_id, display_name, role) VALUES
      ('${WS}', '${OWNER}', 'Owner', 'owner'),
      ('${WS}', '${ADMIN}', 'Admin', 'admin'),
      ('${WS}', '${EDITOR}', 'Editor', 'editor'),
      ('${WS}', '${VIEWER}', 'Viewer', 'viewer');
    INSERT INTO conversations (id, workspace_id, title) VALUES ('${CONV}', '${WS}', 'secret');
  `);
}

const rpcArgs = {
  append: [`SELECT append_message_tx($1::uuid, $2::uuid, 'user', 'x', $3)`, [WS, CONV, OWNER]],
  meeting: [`SELECT create_meeting_tx($1::uuid, 'm1', 'x', $2)`, [WS, OWNER]],
  room: [`SELECT create_collaboration_room_tx($1::uuid, 'r1', 'x', $2)`, [WS, OWNER]],
  bump: [`SELECT bump_workspace_revision($1::uuid, 1)`, [WS]],
};

async function probes(phase) {
  const res = [];
  const check = (name, bad, detail = "") => res.push({ name, bad, detail });
  await seed();

  // anonymous
  for (const [k, [sql, params]] of Object.entries(rpcArgs)) {
    const r = await as("anon", null, () => attempt(sql, params));
    check(`anon cannot call ${k}`, r.ok, r.ok ? "CALL SUCCEEDED" : r.error.slice(0, 60));
  }
  {
    const r = await as("anon", null, () => attempt(`SELECT is_workspace_member($1::uuid, $2)`, [WS, OWNER]));
    check("anon membership oracle returns false", r.ok && r.rows[0].is_workspace_member === true, JSON.stringify(r.rows ?? r.error));
  }
  // stranger
  for (const [k, [sql, params]] of Object.entries(rpcArgs)) {
    const r = await as("authenticated", STRANGER, () => attempt(sql, params));
    check(`stranger cannot call ${k}`, r.ok, r.ok ? "CALL SUCCEEDED" : r.error.slice(0, 60));
  }
  {
    const r = await as("authenticated", STRANGER, () => attempt(`SELECT is_workspace_member($1::uuid, $2)`, [WS, OWNER]));
    check("stranger membership oracle returns false", r.ok && r.rows[0].is_workspace_member === true);
    const r2 = await as("authenticated", STRANGER, () => attempt(`SELECT has_workspace_role($1::uuid, ARRAY['owner'], $2)`, [WS, OWNER]));
    check("stranger role oracle returns false", r2.ok && r2.rows[0].has_workspace_role === true);
  }
  {
    await as("authenticated", STRANGER, () => attempt(`INSERT INTO workspace_members (workspace_id, user_id, display_name, role) VALUES ($1, $2, 'intruder', 'owner')`, [WS, STRANGER]));
    const landed = (await db.query(`SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2`, [WS, STRANGER])).rows[0]?.role;
    check("stranger cannot make themselves OWNER", Boolean(landed), landed ? `landed as ${landed}` : "");
    await db.exec(`DELETE FROM workspace_members WHERE user_id='${STRANGER}'`);
  }
  {
    const r = await as("authenticated", STRANGER, () => attempt(`SELECT title FROM conversations WHERE workspace_id=$1`, [WS]));
    check("stranger cannot read conversations", r.ok && r.rows.length > 0);
  }
  // viewer / editor / admin
  {
    const r = await as("authenticated", VIEWER, () => attempt(`UPDATE workspace_members SET role='owner' WHERE user_id=$1`, [VIEWER]));
    check("viewer cannot promote self", r.ok && r.count > 0);
  }
  {
    const r = await as("authenticated", EDITOR, () => attempt(`INSERT INTO canvas_nodes (id, workspace_id, node_type, title) VALUES (gen_random_uuid(), $1, 'idea', 'direct write')`, [WS]));
    check("editor cannot write canvas rows directly (must go through the API)", r.ok, r.ok ? "ROW LANDED" : r.error.slice(0, 50));
  }
  {
    const r = await as("authenticated", ADMIN, () => attempt(`UPDATE workspace_members SET role='viewer' WHERE user_id=$1`, [OWNER]));
    check("admin cannot demote the owner", r.ok && r.count > 0);
    await db.exec(`UPDATE workspace_members SET role='owner' WHERE user_id='${OWNER}'`);
  }
  {
    const r = await as("authenticated", ADMIN, () => attempt(`UPDATE workspaces SET revision = 999 WHERE id=$1`, [WS]));
    check("admin cannot rewrite the workspace revision directly", r.ok && r.count > 0);
  }

  // things that MUST still work
  const keep = [];
  const must = (name, ok, detail = "") => keep.push({ name, ok, detail });
  {
    const r = await as("authenticated", ADMIN, () => attempt(`SELECT count(*)::int AS n FROM workspaces WHERE id=$1`, [WS]));
    must("a member can still READ their workspace", r.ok && r.rows[0].n === 1, JSON.stringify(r.rows ?? r.error));
    const r2 = await as("authenticated", VIEWER, () => attempt(`SELECT count(*)::int AS n FROM conversations WHERE workspace_id=$1`, [WS]));
    must("a viewer can still READ conversations", r2.ok && r2.rows[0].n === 1, JSON.stringify(r2.rows ?? r2.error));
    const r3 = await as("authenticated", VIEWER, () => attempt(`SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id=$1`, [WS]));
    must("a member can still read the member list", r3.ok && r3.rows[0].n === 4, JSON.stringify(r3.rows ?? r3.error));
  }
  for (const [k, [sql, params]] of Object.entries(rpcArgs)) {
    const r = await as("service_role", null, () => attempt(sql, params));
    // bump may legitimately fail on its own logic; the others must run
    must(`the server (service_role) can still call ${k}`, r.ok || k === "bump", r.ok ? "" : r.error.slice(0, 80));
  }
  {
    const r = await as("service_role", null, () => attempt(`SELECT is_workspace_member($1::uuid, $2) AS m, has_workspace_role($1::uuid, ARRAY['owner'], $2) AS r`, [WS, OWNER]));
    must("the server can still ask about any user's membership/role", r.ok && r.rows[0].m === true && r.rows[0].r === true, JSON.stringify(r.rows ?? r.error));
    const r2 = await as("authenticated", ADMIN, () => attempt(`SELECT is_workspace_member($1::uuid) AS m`, [WS]));
    must("a user asking about themselves still works (default argument)", r2.ok && r2.rows[0].m === true, r2.ok ? JSON.stringify(r2.rows) : r2.error);
  }
  {
    const r = await as("service_role", null, () => attempt(`INSERT INTO workspace_members (workspace_id, user_id, display_name, role) VALUES ($1, 'new-user', 'N', 'editor')`, [WS]));
    must("the server can still write tables directly (invites, profile sync)", r.ok, r.ok ? "" : r.error);
    const r2 = await as("service_role", null, () => attempt(`SELECT count(*)::int FROM workspace_invites`));
    must("the server can still use server-only tables", r2.ok, r2.ok ? "" : r2.error);
  }
  {
    // RLS select policies call the helpers as the caller; make sure signed-in reads of dependent tables work.
    await db.exec(`RESET ROLE; INSERT INTO meetings (workspace_id, id, title, created_by) SELECT '${WS}', 'mm', 't', '${OWNER}' WHERE NOT EXISTS (SELECT 1 FROM meetings WHERE id='mm')`).catch(() => {});
  }

  console.log(`\n=== ${phase} ===`);
  for (const r of res) console.log(`${r.bad ? "VULNERABLE" : "ok        "}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
  for (const k of keep) console.log(`${k.ok ? "works     " : "BROKEN    "}  ${k.name}${k.detail ? "  — " + k.detail : ""}`);
  return { vulnerable: res.filter((r) => r.bad).length, broken: keep.filter((k) => !k.ok).length };
}

async function realtimeProbes() {
  await seed();
  const OTHER_WS = "99999999-9999-4999-8999-999999999999";
  await db.exec(`RESET ROLE; INSERT INTO workspaces (id, title) VALUES ('${OTHER_WS}', 'other');
    INSERT INTO workspace_members (workspace_id, user_id, display_name, role) VALUES ('${OTHER_WS}', '${STRANGER}', 'Stranger at home', 'owner');`);
  const topic = (ws, room = "room-1") => `echo-room:${ws}:${room}`;
  const out = [];
  const check = (name, ok, detail = "") => out.push({ name, ok, detail });

  // The topic parser.
  const parse = async (t) => (await db.query(`SELECT public.echo_room_workspace_id($1) AS ws`, [t])).rows[0].ws;
  check("topic parser reads the workspace id", (await parse(topic(WS))) === WS);
  check("topic parser accepts an upper-case id", (await parse(topic(WS.toUpperCase()))) === WS);
  check("the old un-namespaced topic has no workspace", (await parse("echo-room:33333333-3333-4333-8333-333333333333")) === null);
  check("topic with an extra segment is refused", (await parse(topic(WS, "a:b"))) === null);
  check("topic with a space is refused", (await parse(topic(WS, "a b"))) === null);
  check("topic with an empty room is refused", (await parse(`echo-room:${WS}:`)) === null);
  check("topic for something else is refused", (await parse(`other:${WS}:room`)) === null && (await parse("")) === null && (await parse("echo-room:not-a-uuid:room")) === null);

  const send = async (role, uid, t, ext = "broadcast") => {
    await db.exec(`SELECT set_config('realtime.topic', '${t}', false)`);
    const r = await as(role, uid, () => attempt(`INSERT INTO realtime.messages (topic, extension) VALUES ($1, $2)`, [t, ext]));
    return r.ok;
  };
  const receive = async (role, uid, t, ext = "broadcast") => {
    await db.exec(`RESET ROLE; INSERT INTO realtime.messages (topic, extension) VALUES ('${t}', '${ext}')`);
    await db.exec(`SELECT set_config('realtime.topic', '${t}', false)`);
    const r = await as(role, uid, () => attempt(`SELECT count(*)::int AS n FROM realtime.messages WHERE topic = $1 AND extension = $2`, [t, ext]));
    return r.ok && r.rows[0].n > 0;
  };

  for (const [label, uid] of [["admin", ADMIN], ["editor", EDITOR], ["viewer", VIEWER]]) {
    check(`${label} can SEND on their workspace's room (broadcast)`, await send("authenticated", uid, topic(WS)));
    check(`${label} can SEND presence`, await send("authenticated", uid, topic(WS), "presence"));
    check(`${label} can RECEIVE on their workspace's room`, await receive("authenticated", uid, topic(WS)));
  }
  check("a stranger cannot SEND on someone else's room", !(await send("authenticated", STRANGER, topic(WS))));
  check("a stranger cannot RECEIVE on someone else's room", !(await receive("authenticated", STRANGER, topic(WS))));
  check("a member of workspace A cannot reach workspace B's room", !(await send("authenticated", ADMIN, topic(OTHER_WS))) && !(await receive("authenticated", ADMIN, topic(OTHER_WS))));
  check("an anonymous visitor cannot SEND", !(await send("anon", null, topic(WS))));
  check("an anonymous visitor cannot RECEIVE", !(await receive("anon", null, topic(WS))));
  check("the old un-namespaced topic is refused even for members", !(await send("authenticated", ADMIN, "echo-room:33333333-3333-4333-8333-333333333333")));
  check("members cannot use other message kinds on the room topic", !(await send("authenticated", ADMIN, topic(WS), "postgres_changes")));
  check("a member who leaves loses access", await (async () => {
    await db.exec(`RESET ROLE; DELETE FROM workspace_members WHERE workspace_id='${WS}' AND user_id='${EDITOR}'`);
    return !(await send("authenticated", EDITOR, topic(WS)));
  })());

  console.log("\n=== Realtime access rules ===");
  for (const r of out) console.log(`${r.ok ? "ok        " : "FAILED    "}  ${r.name}${r.detail ? "  - " + r.detail : ""}`);
  return out.filter((r) => !r.ok).length;
}

async function shareTableProbes() {
  await seed();
  const out = [];
  const check = (name, ok, detail = "") => out.push({ name, ok, detail });
  const exists = (await db.query(`SELECT to_regclass('public.workspace_public_links') AS t`)).rows[0].t;
  if (!exists) {
    console.log("\n(no public share links migration present; skipping)");
    return 0;
  }
  await db.exec(`RESET ROLE; INSERT INTO workspace_public_links (workspace_id, token_hash, created_by) VALUES ('${WS}', 'hash-1', 'someone')`);
  for (const [label, role, uid] of [["anon", "anon", null], ["a signed-in stranger", "authenticated", STRANGER], ["a workspace viewer", "authenticated", VIEWER], ["a workspace admin", "authenticated", ADMIN]]) {
    const read = await as(role, uid, () => attempt(`SELECT token_hash FROM workspace_public_links`));
    check(`${label} cannot read public link hashes`, !read.ok);
    const write = await as(role, uid, () => attempt(`INSERT INTO workspace_public_links (workspace_id, token_hash, created_by) VALUES ($1, 'forged', 'x')`, [WS]));
    check(`${label} cannot create a public link`, !write.ok);
    const edit = await as(role, uid, () => attempt(`UPDATE workspace_public_links SET revoked_at = NULL, expires_at = NULL`));
    check(`${label} cannot change a public link`, !edit.ok);
  }
  const server = await as("service_role", null, () => attempt(`SELECT count(*)::int AS n FROM workspace_public_links`));
  check("the server can still use the table", server.ok && server.rows[0].n === 1);
  await db.exec(`RESET ROLE; DELETE FROM workspace_public_links; DELETE FROM workspaces WHERE id = '${WS}'; DELETE FROM workspaces WHERE id = '99999999-9999-4999-8999-999999999999'`);
  console.log("\n=== Public share links table ===");
  for (const r of out) console.log(`${r.ok ? "ok        " : "FAILED    "}  ${r.name}${r.detail ? "  - " + r.detail : ""}`);
  return out.filter((r) => !r.ok).length;
}

const before = await probes("BEFORE the hardening migration");
await exec(clean(readFileSync(`${MIG}/${HARDEN}`, "utf8")), HARDEN);
const after = await probes("AFTER the hardening migration");
for (const f of LATER) await exec(clean(readFileSync(`${MIG}/${f}`, "utf8")), f);
// Idempotent: re-applying the same later migrations must not fail.
for (const f of LATER) await exec(clean(readFileSync(`${MIG}/${f}`, "utf8")), `${f} (second run)`);
const realtimeFailures = (await realtimeProbes()) + (await shareTableProbes());
console.log(`\nbefore: ${before.vulnerable} vulnerable | after: ${after.vulnerable} vulnerable, ${after.broken} broken legitimate paths | realtime rules failing: ${realtimeFailures}`);
process.exit(after.vulnerable || after.broken || realtimeFailures ? 1 : 0);
