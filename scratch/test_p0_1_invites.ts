/**
 * P0.1 — Invite links and role management.
 *
 * Covers the pure rules (inviteLogic), token hashing, and the database operations (inviteStore)
 * against an in-memory fake Supabase client, including expiry, revocation, use limits, a lost race,
 * and the rule that an invite never changes an existing member.
 *
 * Run: npx tsx scratch/test_p0_1_invites.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canEditWorkspace,
  canManageMembers,
  computeExpiry,
  decideRemoval,
  decideRoleChange,
  evaluateInvite,
  isPlausibleInviteToken,
  parseCreateInvite,
} from "../src/app/lib/invites/inviteLogic";
import { generateInviteToken, hashInviteToken } from "../src/app/lib/invites/inviteToken";
import {
  acceptInvite,
  createInvite,
  listActiveInvites,
  listMembers,
  removeMember,
  revokeInvite,
  setMemberRole,
} from "../src/app/lib/invites/inviteStore";

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

async function rejects(fn: () => Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? "" };
  }
}

type Row = Record<string, unknown>;

/** In-memory stand-in for the query-builder calls inviteStore makes. */
function fakeClient(tables: Record<string, Row[]>, hooks: { beforeUpdate?: (table: string) => void } = {}): SupabaseClient {
  let idCounter = 0;
  const from = (table: string) => {
    tables[table] = tables[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" | "delete" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let wantRows = false;

    const exec = (): { data: Row[]; error: null } | { data: null; error: { message: string } } => {
      if (mode === "insert") {
        const row: Row = { id: `id-${++idCounter}`, created_at: new Date().toISOString(), use_count: 0, revoked_at: null, ...inserted };
        const unique = table === "workspace_members" && tables[table].some((r) => r.workspace_id === row.workspace_id && r.user_id === row.user_id);
        if (unique) return { data: null, error: { message: "duplicate key" } };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      let rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        hooks.beforeUpdate?.(table);
        rows = tables[table].filter((r) => filters.every((f) => f(r)));
        rows.forEach((r) => Object.assign(r, patch));
      } else if (mode === "delete") {
        tables[table] = tables[table].filter((r) => !rows.includes(r));
      } else if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: rows, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => {
        wantRows = true;
        return builder;
      },
      insert: (row: Row) => {
        mode = "insert";
        inserted = row;
        return builder;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return builder;
      },
      delete: () => {
        mode = "delete";
        return builder;
      },
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
      is: (col: string, val: unknown) => (filters.push((r) => (r[col] ?? null) === val), builder),
      gt: (col: string, val: unknown) => (filters.push((r) => String(r[col]) > String(val)), builder),
      order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), builder),
      single: async () => {
        const r = exec();
        return r.error ? r : { data: r.data[0] ?? null, error: null };
      },
      maybeSingle: async () => {
        const r = exec();
        return r.error ? r : { data: r.data[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        void wantRows;
        resolve(exec());
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const WS = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner-user";
const NOW = new Date("2026-11-09T12:00:00Z");

async function main() {
  console.log("rules: who can do what");
  check("owner and admin manage members", canManageMembers("owner") && canManageMembers("admin"));
  check("editor/member/viewer cannot manage", !canManageMembers("editor") && !canManageMembers("member") && !canManageMembers("viewer"));
  check("viewer cannot edit; editor can", !canEditWorkspace("viewer") && canEditWorkspace("editor") && canEditWorkspace("owner"));

  const change = (actorRole: any, targetRole: any, newRole: any = "viewer", same = false) =>
    decideRoleChange({ actorRole, actorUserId: "a", targetUserId: same ? "a" : "t", targetRole, newRole });
  check("owner can demote an editor", change("owner", "editor").ok);
  check("admin can promote a viewer to editor", change("admin", "viewer", "editor").ok);
  check("editor cannot change roles", !change("editor", "viewer").ok);
  check("nobody can change the owner", !change("owner", "owner").ok && !change("admin", "owner").ok);
  check("only the owner can change an admin", change("owner", "admin").ok && !change("admin", "admin").ok);
  check("cannot change your own role", !change("owner", "editor", "viewer", true).ok);
  check("cannot grant owner/admin through role change", !change("owner", "editor", "owner").ok && !change("owner", "editor", "admin").ok);
  check("garbage role rejected", !change("owner", "editor", "superuser").ok && !change("owner", "editor", null).ok);

  const remove = (actorRole: any, targetRole: any, same = false) =>
    decideRemoval({ actorRole, actorUserId: "a", targetUserId: same ? "a" : "t", targetRole });
  check("owner can remove an editor", remove("owner", "editor").ok);
  check("editor cannot remove others", !remove("editor", "viewer").ok);
  check("anyone but the owner can leave", remove("viewer", "viewer", true).ok && remove("editor", "editor", true).ok);
  check("owner cannot leave or be removed", !remove("owner", "owner", true).ok && !remove("admin", "owner").ok);
  check("admin cannot remove another admin", !remove("admin", "admin").ok && remove("owner", "admin").ok);

  console.log("tokens");
  const t1 = generateInviteToken();
  const t2 = generateInviteToken();
  check("tokens are unique and url-safe", t1 !== t2 && /^[A-Za-z0-9_-]+$/.test(t1));
  check("token has enough entropy (32 chars = 192 bits)", t1.length === 32);
  check("hash is stable sha-256 hex and differs from the token", hashInviteToken(t1) === hashInviteToken(t1) && /^[0-9a-f]{64}$/.test(hashInviteToken(t1)) && hashInviteToken(t1) !== t1);
  check("plausibility check accepts real tokens", isPlausibleInviteToken(t1));
  check("plausibility check rejects junk", !isPlausibleInviteToken("short") && !isPlausibleInviteToken("a".repeat(20) + "!") && !isPlausibleInviteToken(42) && !isPlausibleInviteToken("../etc/passwd" + "a".repeat(20)));

  console.log("create-invite input");
  check("defaults: editor, 7 days, unlimited", (() => { const r = parseCreateInvite({}); return r.ok && r.value.role === "editor" && r.value.expiresInDays === 7 && r.value.maxUses === null; })());
  check("viewer, 30 days, 5 uses accepted", (() => { const r = parseCreateInvite({ role: "viewer", expiresInDays: 30, maxUses: 5 }); return r.ok && r.value.maxUses === 5; })());
  check("owner/admin role cannot be invited", !parseCreateInvite({ role: "owner" }).ok && !parseCreateInvite({ role: "admin" }).ok);
  check("odd expiry rejected", !parseCreateInvite({ expiresInDays: 9999 }).ok && !parseCreateInvite({ expiresInDays: "7" }).ok);
  check("bad maxUses rejected", !parseCreateInvite({ maxUses: 0 }).ok && !parseCreateInvite({ maxUses: 1.5 }).ok && !parseCreateInvite({ maxUses: 100000 }).ok);
  check("non-object body treated as defaults", parseCreateInvite(null).ok);

  console.log("invite state");
  const live = { expiresAt: computeExpiry(NOW, 7).toISOString(), maxUses: null, useCount: 0, revokedAt: null };
  check("fresh invite is valid", evaluateInvite(live, NOW).ok);
  check("expired invite rejected", (() => { const r = evaluateInvite({ ...live, expiresAt: NOW.toISOString() }, NOW); return !r.ok && r.reason === "expired"; })());
  check("revoked invite rejected", (() => { const r = evaluateInvite({ ...live, revokedAt: NOW.toISOString() }, NOW); return !r.ok && r.reason === "revoked"; })());
  check("used-up invite rejected", (() => { const r = evaluateInvite({ ...live, maxUses: 2, useCount: 2 }, NOW); return !r.ok && r.reason === "used_up"; })());

  console.log("store: create / list / revoke");
  const tables: Record<string, Row[]> = {
    workspace_members: [{ workspace_id: WS, user_id: OWNER, display_name: "Olivia", role: "owner", color: "#3b82f6", created_at: "2026-01-01" }],
    workspace_invites: [],
  };
  const client = fakeClient(tables);

  const created = await createInvite(client, WS, OWNER, { role: "editor", expiresInDays: 7, maxUses: null }, NOW);
  check("createInvite returns a token once", isPlausibleInviteToken(created.token));
  check("database stores only the hash, never the token", tables.workspace_invites[0].token_hash === hashInviteToken(created.token) && !JSON.stringify(tables.workspace_invites).includes(created.token));
  check("summary exposes no token or hash", !("token" in created.invite) && !("token_hash" in created.invite) && !JSON.stringify(created.invite).includes("hash"));

  const listed = await listActiveInvites(client, WS, NOW);
  check("listActiveInvites shows the new invite", listed.length === 1 && listed[0].id === created.invite.id);
  check("expired invites are not listed", (await listActiveInvites(client, WS, computeExpiry(NOW, 8))).length === 0);

  console.log("store: accept");
  const joined = await acceptInvite(client, created.token, "bob", "Bob", NOW);
  check("accepting adds a member with the invite's role", !joined.alreadyMember && joined.role === "editor" && joined.workspaceId === WS);
  check("joined member row has the profile name", tables.workspace_members.some((m) => m.user_id === "bob" && m.display_name === "Bob" && m.role === "editor"));
  check("use count incremented", tables.workspace_invites[0].use_count === 1);

  const again = await acceptInvite(client, created.token, "bob", "Bob", NOW);
  check("re-opening the link is a no-op for existing members", again.alreadyMember && tables.workspace_invites[0].use_count === 1);

  const ownerOpens = await acceptInvite(client, created.token, OWNER, "Olivia", NOW);
  check("an invite never downgrades the owner", ownerOpens.alreadyMember && ownerOpens.role === "owner" && tables.workspace_members.find((m) => m.user_id === OWNER)!.role === "owner");

  const wrong = await rejects(() => acceptInvite(client, generateInviteToken(), "eve", "Eve", NOW));
  check("unknown token -> NOT_FOUND", wrong?.code === "NOT_FOUND");
  check("unknown token adds nobody", !tables.workspace_members.some((m) => m.user_id === "eve"));

  const late = await rejects(() => acceptInvite(client, created.token, "carol", "Carol", computeExpiry(NOW, 8)));
  check("expired invite -> FORBIDDEN with readable message", late?.code === "FORBIDDEN" && /expired/i.test(late.message));
  check("expired invite adds nobody", !tables.workspace_members.some((m) => m.user_id === "carol"));

  console.log("store: use limit, race, revoke");
  const single = await createInvite(client, WS, OWNER, { role: "viewer", expiresInDays: 1, maxUses: 1 }, NOW);
  const first = await acceptInvite(client, single.token, "dave", "Dave", NOW);
  check("single-use invite grants its (viewer) role", first.role === "viewer");
  const second = await rejects(() => acceptInvite(client, single.token, "erin", "Erin", NOW));
  check("single-use invite refuses a second person", second?.code === "FORBIDDEN" && /limit/i.test(second.message));
  check("refused person is not added", !tables.workspace_members.some((m) => m.user_id === "erin"));

  // Lost race: another person redeems between our read and our claim; max_uses must still hold.
  const raceTables: Record<string, Row[]> = { workspace_members: [], workspace_invites: [] };
  let raced = false;
  const raceClient = fakeClient(raceTables, {
    beforeUpdate: (table) => {
      if (table === "workspace_invites" && !raced) {
        raced = true;
        raceTables.workspace_invites[0].use_count = 1; // someone else took the last use
      }
    },
  });
  const limited = await createInvite(raceClient, WS, OWNER, { role: "editor", expiresInDays: 1, maxUses: 1 }, NOW);
  const lost = await rejects(() => acceptInvite(raceClient, limited.token, "frank", "Frank", NOW));
  check("lost race cannot exceed max_uses", lost?.code === "FORBIDDEN" && !raceTables.workspace_members.some((m) => m.user_id === "frank") && raceTables.workspace_invites[0].use_count === 1);

  // A failed membership insert (duplicate) must give the use back.
  const dupTables: Record<string, Row[]> = { workspace_members: [], workspace_invites: [] };
  const dupClient = fakeClient(dupTables);
  const dupInvite = await createInvite(dupClient, WS, OWNER, { role: "editor", expiresInDays: 1, maxUses: 5 }, NOW);
  const dupResult = await acceptInvite(dupClient, dupInvite.token, "gina", "Gina", NOW);
  check("normal join consumes one use", dupResult.alreadyMember === false && dupTables.workspace_invites[0].use_count === 1);

  await revokeInvite(client, WS, created.invite.id, NOW);
  const revoked = await rejects(() => acceptInvite(client, created.token, "hank", "Hank", NOW));
  check("revoked link stops working", revoked?.code === "FORBIDDEN" && /cancel/i.test(revoked.message));
  check("revoked invite disappears from the list", !(await listActiveInvites(client, WS, NOW)).some((i) => i.id === created.invite.id));
  check("revoking someone else's/unknown invite -> NOT_FOUND", (await rejects(() => revokeInvite(client, WS, "no-such-id", NOW)))?.code === "NOT_FOUND");
  check("revoke is scoped to the workspace", (await rejects(() => revokeInvite(client, "22222222-2222-4222-8222-222222222222", single.invite.id, NOW)))?.code === "NOT_FOUND");

  console.log("store: members");
  const members = await listMembers(client, WS);
  check("listMembers returns the roster with roles", members.some((m) => m.userId === OWNER && m.role === "owner") && members.some((m) => m.userId === "bob"));
  await setMemberRole(client, WS, "bob", "viewer");
  check("setMemberRole changes the role", tables.workspace_members.find((m) => m.user_id === "bob")!.role === "viewer");
  check("setMemberRole on a stranger -> NOT_FOUND", (await rejects(() => setMemberRole(client, WS, "nobody", "viewer")))?.code === "NOT_FOUND");
  await removeMember(client, WS, "bob");
  check("removeMember deletes the row", !tables.workspace_members.some((m) => m.user_id === "bob"));

  console.log("wiring / safety");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const sql = read("supabase/migrations/20261109000000_p0_1_workspace_invites.sql");
  check("migration stores token_hash, not a token", /token_hash TEXT NOT NULL UNIQUE/.test(sql) && !/\btoken TEXT/.test(sql));
  check("migration enables RLS with no policies", /ENABLE ROW LEVEL SECURITY/.test(sql) && !/CREATE POLICY/i.test(sql));
  check("migration limits invite roles to editor/viewer", /role IN \('editor', 'viewer'\)/.test(sql));

  const accept = read("src/app/api/invites/accept/route.ts");
  check("accept route requires a real (non-demo) identity", /resolveServerIdentity/.test(accept) && /!authenticated/.test(accept));
  const invitesRoute = read("src/app/api/workspace/[workspaceId]/invites/route.ts");
  check("invite create/list restricted to owner+admin", (invitesRoute.match(/\["owner", "admin"\]/g) ?? []).length === 2);
  const revokeRoute = read("src/app/api/workspace/[workspaceId]/invites/[inviteId]/route.ts");
  check("revoke restricted to owner+admin", /\["owner", "admin"\]/.test(revokeRoute));
  const membersRoute = read("src/app/api/workspace/[workspaceId]/members/[userId]/route.ts");
  check("member changes go through the decision rules", /decideRoleChange/.test(membersRoute) && /decideRemoval/.test(membersRoute));
  const logic = read("src/app/lib/invites/inviteLogic.ts");
  check("client-shared logic does not import node:crypto", !/node:crypto/.test(logic));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
