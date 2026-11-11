/**
 * LIVE security probe (not part of `npm test`; it talks to the real Supabase project).
 *
 * Attacks the database the way an outsider with only the public key could, using a throwaway
 * user and a throwaway workspace that it creates and deletes. It never touches existing
 * workspaces or users. Prints VULNERABLE / ok per probe.
 *
 * Run: node --env-file=.env.local scratch/live_check_security.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("missing Supabase env vars");

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const TABLES = [
  "workspaces", "workspace_members", "conversations", "messages", "canvas_nodes", "canvas_edges",
  "canvas_groups", "canvas_actions", "meetings", "meeting_participants", "meeting_transcript_segments",
  "meeting_insights", "collaboration_rooms", "collaboration_room_participants", "ai_usage_events", "workspace_invites",
];

const results = [];
const note = (name, vulnerable, detail = "") => {
  results.push({ name, vulnerable });
  console.log(`${vulnerable ? "VULNERABLE" : "ok        "}  ${name}${detail ? "  — " + detail : ""}`);
};

const stamp = Date.now();
const WS = randomUUID();
const CONV = randomUUID();
const OWNER_ID = `audit-owner-${stamp}`; // a fake owner (workspace_members.user_id is plain text)
const created = { users: [], workspace: false };

async function newUser(label) {
  const email = `audit-${label}-${stamp}@example.invalid`;
  const password = `Aud!t-${randomUUID()}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  created.users.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}

/** Did the attacker's insert actually land? Checked with the service role, not by read-back. */
const memberExists = async (userId) => {
  const { data } = await svc.from("workspace_members").select("role").eq("workspace_id", WS).eq("user_id", userId);
  return data?.[0]?.role ?? null;
};

const rowsVisible = async (client, table) => {
  const { data, error } = await client.from(table).select("*").limit(5);
  return { count: data?.length ?? 0, error: error?.message };
};

async function main() {
  // Throwaway workspace with a fake owner, created with the service role.
  {
    const { error } = await svc.from("workspaces").insert({ id: WS, title: "SECURITY-AUDIT-TEMP" });
    if (error) throw new Error(`create workspace: ${error.message}`);
    created.workspace = true;
    const { error: e2 } = await svc.from("workspace_members").insert({ workspace_id: WS, user_id: OWNER_ID, display_name: "Audit Owner", role: "owner" });
    if (e2) throw new Error(`create owner: ${e2.message}`);
    await svc.from("conversations").insert({ id: CONV, workspace_id: WS, title: "audit secret conversation" });
  }

  console.log("\n== 1. Anonymous visitor (public key only) ==");
  for (const t of TABLES) {
    const r = await rowsVisible(anon, t);
    note(`anon cannot read ${t}`, r.count > 0, r.error ? `blocked: ${r.error.slice(0, 50)}` : `rows=${r.count}`);
  }
  {
    const { data, error } = await anon.rpc("is_workspace_member", { p_workspace_id: WS, p_user_id: OWNER_ID });
    note("anon cannot ask whether a user belongs to a workspace (membership oracle)", data === true, error ? error.message.slice(0, 60) : `answer=${data}`);
  }
  {
    const { data, error } = await anon.rpc("has_workspace_role", { p_workspace_id: WS, p_required_roles: ["owner"], p_user_id: OWNER_ID });
    note("anon cannot ask what role a user has", data === true, error ? error.message.slice(0, 60) : `answer=${data}`);
  }
  const rpcCalls = () => [
    ["append_message_tx", { p_workspace_id: WS, p_conversation_id: CONV, p_role: "user", p_content: "audit rpc", p_sender_id: OWNER_ID }],
    ["create_meeting_tx", { p_workspace_id: WS, p_meeting_id: `audit-${stamp}`, p_title: "audit", p_actor_id: OWNER_ID }],
    ["create_collaboration_room_tx", { p_workspace_id: WS, p_room_id: `audit-room-${stamp}`, p_title: "audit", p_actor_id: OWNER_ID }],
    ["apply_canvas_mutation_tx", { p_workspace_id: WS, p_actor_id: OWNER_ID, p_expected_revision: 1, p_upsert_nodes: [], p_delete_node_ids: [], p_upsert_edges: [], p_delete_edge_ids: [], p_upsert_groups: [], p_delete_group_ids: [] }],
  ];
  for (const [fn, args] of rpcCalls()) {
    const { error } = await anon.rpc(fn, args);
    note(`anon cannot call ${fn}`, !error, error ? error.message.slice(0, 80) : "CALL SUCCEEDED");
  }

  console.log("\n== 2. Signed-in stranger (not a member of the workspace) ==");
  const stranger = await newUser("stranger");
  for (const t of ["workspaces", "workspace_members", "conversations", "messages", "canvas_nodes", "meetings"]) {
    const r = await rowsVisible(stranger.client, t);
    // The stranger may legitimately see their own (none) rows; any row of OUR workspace is a leak.
    const { data } = await stranger.client.from(t).select("*").eq(t === "workspaces" ? "id" : "workspace_id", WS).limit(5);
    note(`stranger cannot read the audit workspace's ${t}`, (data?.length ?? 0) > 0, r.error ? r.error.slice(0, 50) : `rows=${data?.length ?? 0}`);
  }
  {
    // No .select(): a failed read-back would otherwise look like a blocked insert.
    const { error } = await stranger.client.from("workspace_members").insert({ workspace_id: WS, user_id: stranger.id, display_name: "intruder", role: "owner" });
    const landed = await memberExists(stranger.id);
    note("stranger cannot add THEMSELVES as OWNER of someone else's workspace", landed !== null, landed ? `ROW LANDED with role=${landed}` : (error ? error.message.slice(0, 60) : "no row"));
    if (landed) {
      const { data: peek } = await stranger.client.from("conversations").select("title").eq("workspace_id", WS);
      note("...and then read that workspace's private conversations", (peek?.length ?? 0) > 0, `conversations visible=${peek?.length ?? 0}`);
    }
  }
  await svc.from("workspace_members").delete().eq("workspace_id", WS).eq("user_id", stranger.id);
  {
    const { error } = await stranger.client.from("workspace_members").insert({ workspace_id: WS, user_id: `someone-else-${stamp}`, display_name: "ghost", role: "viewer" });
    const landed = await memberExists(`someone-else-${stamp}`);
    note("stranger cannot add ANOTHER user to someone else's workspace", landed !== null, landed ? "ROW LANDED" : (error ? error.message.slice(0, 60) : "no row"));
    await svc.from("workspace_members").delete().eq("workspace_id", WS).eq("user_id", `someone-else-${stamp}`);
  }
  {
    const { data, error } = await stranger.client.from("workspaces").update({ title: "hacked" }).eq("id", WS).select();
    note("stranger cannot edit the workspace", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows changed=${data?.length ?? 0}`);
  }
  {
    const { data } = await stranger.client.rpc("is_workspace_member", { p_workspace_id: WS, p_user_id: OWNER_ID });
    note("stranger cannot use the membership oracle either", data === true, `answer=${data}`);
  }
  for (const [fn, args] of rpcCalls()) {
    const { error } = await stranger.client.rpc(fn, args);
    note(`stranger cannot call ${fn} on someone else's workspace (even naming the owner as actor)`, !error, error ? error.message.slice(0, 80) : "CALL SUCCEEDED");
  }

  console.log("\n== 3. Viewer (lowest role) trying to go beyond viewing ==");
  const viewer = await newUser("viewer");
  await svc.from("workspace_members").insert({ workspace_id: WS, user_id: viewer.id, display_name: "Audit Viewer", role: "viewer" });
  {
    const { data, error } = await viewer.client.from("workspace_members").update({ role: "owner" }).eq("workspace_id", WS).eq("user_id", viewer.id).select();
    note("viewer cannot promote themselves to owner", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows changed=${data?.length ?? 0}`);
  }
  {
    const nodeId = randomUUID();
    const { error } = await viewer.client.from("canvas_nodes").insert({ id: nodeId, workspace_id: WS, node_type: "idea", title: "viewer wrote this", position_x: 0, position_y: 0 });
    const { data: landed } = await svc.from("canvas_nodes").select("id").eq("id", nodeId);
    note("viewer cannot write canvas nodes directly", (landed?.length ?? 0) > 0, landed?.length ? "ROW LANDED" : (error ? error.message.slice(0, 60) : "no row"));
  }
  {
    const { data, error } = await viewer.client.from("workspace_members").delete().eq("workspace_id", WS).eq("user_id", OWNER_ID).select();
    note("viewer cannot remove the owner", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows deleted=${data?.length ?? 0}`);
  }

  console.log("\n== 4. Admin versus owner (rules the app enforces; does the database?) ==");
  const admin = await newUser("admin");
  await svc.from("workspace_members").insert({ workspace_id: WS, user_id: admin.id, display_name: "Audit Admin", role: "admin" });
  {
    const { data, error } = await admin.client.from("workspace_members").update({ role: "viewer" }).eq("workspace_id", WS).eq("user_id", OWNER_ID).select();
    note("admin cannot demote the OWNER (app rule: nobody can change the owner)", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows changed=${data?.length ?? 0}`);
    if (data?.length) await svc.from("workspace_members").update({ role: "owner" }).eq("workspace_id", WS).eq("user_id", OWNER_ID);
  }
  {
    const { data, error } = await admin.client.from("workspace_members").update({ role: "owner" }).eq("workspace_id", WS).eq("user_id", admin.id).select();
    note("admin cannot promote themselves to owner", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows changed=${data?.length ?? 0}`);
    if (data?.length) await svc.from("workspace_members").update({ role: "admin" }).eq("workspace_id", WS).eq("user_id", admin.id);
  }
  {
    const { data, error } = await admin.client.from("workspaces").delete().eq("id", WS).select();
    note("admin cannot delete the workspace (only the owner may)", Boolean(data?.length), error ? error.message.slice(0, 60) : `rows deleted=${data?.length ?? 0}`);
    if (data?.length) created.workspace = false; // it is already gone
  }
}

let failure = null;
try {
  await main();
} catch (e) {
  failure = e;
} finally {
  // Always clean up everything this probe created.
  if (created.workspace) await svc.from("workspaces").delete().eq("id", WS); // cascades to members/conversations
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  const { count } = await svc.from("workspaces").select("id", { count: "exact", head: true }).eq("id", WS);
  console.log(`\ncleanup: temp users deleted=${created.users.length}, temp workspace remaining=${count ?? 0}`);
}
if (failure) {
  console.error("\nPROBE ERROR:", failure.message);
  process.exit(2);
}
const bad = results.filter((r) => r.vulnerable);
console.log(`\n${results.length} probes, ${bad.length} vulnerable`);
process.exit(bad.length ? 1 : 0);
