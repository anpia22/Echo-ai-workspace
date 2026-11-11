/**
 * P1.7 — Do the batches that undo and redo send actually work in the database?
 *
 * Replays every migration in an in-memory Postgres (pglite) and calls the real
 * apply_canvas_mutation_tx function with the batches an undo or redo produces: deleting a node
 * together with its edge, putting them back, repeating a delete someone else already made, and so on.
 *
 * Run: node scratch/test_p1_7_db_batches.mjs
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIG = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const db = new PGlite();

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

// Supabase-like environment (roles and the auth helpers the migrations use).
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  CREATE SCHEMA realtime;
  CREATE TABLE realtime.messages (id serial PRIMARY KEY, topic text NOT NULL, extension text NOT NULL, payload jsonb);
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('realtime.topic', true), '') $$;
`);
const clean = (sql) => sql.replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?;?/gi, "");
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) await db.exec(clean(readFileSync(`${MIG}/${f}`, "utf8")));

const WS = "11111111-1111-4111-8111-111111111111";
const ACTOR = "owner-1";
await db.exec(`
  INSERT INTO workspaces (id, title) VALUES ('${WS}', 'undo test');
  INSERT INTO workspace_members (workspace_id, user_id, display_name, role) VALUES ('${WS}', '${ACTOR}', 'Owner', 'owner');
`);

const N1 = "a1111111-1111-4111-8111-111111111111";
const N2 = "a2222222-2222-4222-8222-222222222222";
const N3 = "a3333333-3333-4333-8333-333333333333";
const E1 = "e1111111-1111-4111-8111-111111111111";
const G1 = "d1111111-1111-4111-8111-111111111111";
const node = (id, title, x = 0, y = 0) => ({ id, nodeType: "idea", title, description: null, positionX: x, positionY: y });

/** Calls the real function the way the API does, as the server (service role). */
async function batch(m = {}) {
  const rev = (await db.query(`SELECT revision FROM workspaces WHERE id = $1`, [WS])).rows[0].revision;
  await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false); SET ROLE service_role;`);
  try {
    const r = await db.query(
      `SELECT apply_canvas_mutation_tx($1::uuid, $2, $3::bigint, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NULL) AS r`,
      [WS, ACTOR, Number(rev), JSON.stringify(m.upsertNodes ?? []), JSON.stringify(m.deleteNodeIds ?? []), JSON.stringify(m.upsertEdges ?? []), JSON.stringify(m.deleteEdgeIds ?? []), JSON.stringify(m.upsertGroups ?? []), JSON.stringify(m.deleteGroupIds ?? [])]
    );
    return { ok: true, result: r.rows[0].r, before: Number(rev) };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec("RESET ROLE;");
  }
}
const count = async (table) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id = $1`, [WS])).rows[0].n;
const titleOf = async (id) => (await db.query(`SELECT title FROM canvas_nodes WHERE id = $1`, [id])).rows[0]?.title ?? null;
const revision = async () => Number((await db.query(`SELECT revision FROM workspaces WHERE id = $1`, [WS])).rows[0].revision);

console.log("the AI adds two nodes, an edge and a group");
{
  const r = await batch({ upsertNodes: [node(N1, "one", 10, 10), node(N2, "two", 300, 10)], upsertEdges: [{ id: E1, sourceId: N1, targetId: N2, relationship: "causes" }], upsertGroups: [{ id: G1, title: "grp", memberIds: [N1, N2] }] });
  check("the batch is accepted", r.ok, r.error);
  check("it is all there", (await count("canvas_nodes")) === 2 && (await count("canvas_edges")) === 1 && (await count("canvas_groups")) === 1);
}

console.log("UNDO of that: delete the group, the edge and both nodes in one batch");
{
  const before = await revision();
  const r = await batch({ deleteNodeIds: [N1, N2], deleteEdgeIds: [E1], deleteGroupIds: [G1] });
  check("the batch is accepted (the edge is listed AND would cascade from its nodes)", r.ok, r.error);
  check("everything is gone", (await count("canvas_nodes")) === 0 && (await count("canvas_edges")) === 0 && (await count("canvas_groups")) === 0);
  check("the revision went up by exactly one", (await revision()) === before + 1);
}

console.log("REDO: put them all back in one batch");
{
  const r = await batch({ upsertNodes: [node(N1, "one", 10, 10), node(N2, "two", 300, 10)], upsertEdges: [{ id: E1, sourceId: N1, targetId: N2, relationship: "causes" }], upsertGroups: [{ id: G1, title: "grp", memberIds: [N1, N2] }] });
  check("the batch is accepted", r.ok, r.error);
  check("everything is back, with the same ids", (await count("canvas_nodes")) === 2 && (await count("canvas_edges")) === 1 && (await count("canvas_groups")) === 1 && (await titleOf(N1)) === "one");
}

console.log("UNDO when a collaborator already deleted some of it");
{
  await batch({ deleteNodeIds: [N2] }); // someone else deletes node two (its edge cascades)
  check("their delete cascaded the edge", (await count("canvas_edges")) === 0);
  const r = await batch({ deleteNodeIds: [N1, N2], deleteEdgeIds: [E1] }); // my undo still lists everything
  check("deleting things that are already gone is accepted, not an error", r.ok, r.error);
  check("what remained is removed", (await count("canvas_nodes")) === 0);
}

console.log("undoing a move or a rename");
{
  await batch({ upsertNodes: [node(N1, "original", 5, 5)] });
  await batch({ upsertNodes: [node(N1, "original", 400, 400)] }); // my drag
  const r = await batch({ upsertNodes: [node(N1, "original", 5, 5)] }); // undo of my drag
  check("the move is undone in the database", r.ok && (await db.query(`SELECT position_x FROM canvas_nodes WHERE id = $1`, [N1])).rows[0].position_x === 5, r.error);
  const rn = await batch({ upsertNodes: [node(N1, "renamed", 5, 5)] });
  check("a rename saves", rn.ok && (await titleOf(N1)) === "renamed", rn.error);
}

console.log("undoing a group change and an edge label");
{
  await batch({ upsertNodes: [node(N2, "two", 1, 1), node(N3, "three", 2, 2)], upsertEdges: [{ id: E1, sourceId: N1, targetId: N2, relationship: "causes" }], upsertGroups: [{ id: G1, title: "grp", memberIds: [N1, N2, N3] }] });
  const r = await batch({ upsertGroups: [{ id: G1, title: "grp", memberIds: [N1, N2] }], upsertEdges: [{ id: E1, sourceId: N1, targetId: N2, relationship: "solves" }] });
  check("a smaller group and a changed label save together", r.ok, r.error);
  check("the group now has two members", (await db.query(`SELECT jsonb_array_length(member_ids) AS n FROM canvas_groups WHERE id = $1`, [G1])).rows[0].n === 2);
  check("the edge label changed", (await db.query(`SELECT relationship FROM canvas_edges WHERE id = $1`, [E1])).rows[0].relationship === "solves");
}

console.log("a stale revision is still refused (the outbox rebases and retries)");
{
  await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false); SET ROLE service_role;`);
  let err = null;
  try {
    await db.query(`SELECT apply_canvas_mutation_tx($1::uuid, $2, 1::bigint, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL)`, [WS, ACTOR]);
  } catch (e) { err = e.message; }
  await db.exec("RESET ROLE;");
  check("an old revision is refused with the stale-revision message", Boolean(err) && /stale/i.test(err), String(err));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
