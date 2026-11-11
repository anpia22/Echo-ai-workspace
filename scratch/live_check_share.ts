/**
 * LIVE check of public share links against the real Supabase project (not part of `npm test`).
 * Needs migrations 20261110020000 and 20261111000000 applied. Uses a throwaway workspace with TWO
 * conversations (each with its own canvas, like the app), removed at the end.
 *
 * Run: npx tsx --env-file=.env.local scratch/live_check_share.ts
 * Optional: LIVE_BASE_URL=http://localhost:3003 also checks the HTTP endpoint of a running app.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { clearShareCache, createShareLink, listActiveShareLinks, loadPublicView, revokeShareLink } from "../src/app/lib/share/shareStore";

const svc = getServerSupabaseClient();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const WS = randomUUID();
const C1 = randomUUID(); // shared
const C2 = randomUUID(); // must stay private
const PRIVATE_USER = `private-user-${Date.now()}`;

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok        " : "PROBLEM   "}  ${name}${detail ? "  - " + detail : ""}`);
};

const n = (id: string, title: string, x: number, y: number, nodeType = "problem") => ({ id, nodeType, title, position: { x, y } });

async function run() {
  let failure: unknown = null;
  try {
    await svc.from("workspaces").insert({ id: WS, title: "SHARE-AUDIT-TEMP-WORKSPACE-NAME" }).throwOnError();
    await svc.from("workspace_members").insert({ workspace_id: WS, user_id: PRIVATE_USER, display_name: "private.person@example.com", role: "owner" }).throwOnError();
    await svc.from("conversations").insert([
      { id: C1, workspace_id: WS, title: "Shared chat", metadata: { canvas: { nodes: [n("a", "Problem of focusing", 100, 400), n("b", "Time-boxing", 400, 100, "solution")], edges: [{ id: "e1", sourceId: "b", targetId: "a", relationship: "solves" }], groups: [] } } },
      { id: C2, workspace_id: WS, title: "Private other chat", metadata: { canvas: { nodes: [n("c", "SECRET-OTHER-NODE", 100, 400, "solution")], edges: [], groups: [] } } },
    ]).throwOnError();
    const t = Date.now();
    await svc.from("messages").insert([
      { conversation_id: C1, workspace_id: WS, role: "user", content: "Hello from a participant", sender_id: PRIVATE_USER, created_at: new Date(t - 2000).toISOString() },
      { conversation_id: C1, workspace_id: WS, role: "assistant", content: "Hello from Echo", created_at: new Date(t - 1000).toISOString() },
      { conversation_id: C1, workspace_id: WS, role: "system", content: "SYSTEM-SECRET", created_at: new Date(t - 3000).toISOString() },
      { conversation_id: C2, workspace_id: WS, role: "user", content: "SECRET-OTHER-MESSAGE", created_at: new Date(t - 500).toISOString() },
    ]).throwOnError();
    // The workspace-wide canvas merges both conversations (this is what used to be drawn publicly).
    await svc.from("canvas_nodes").insert([
      { id: randomUUID(), workspace_id: WS, node_type: "problem", title: "MERGED-A", position_x: 100, position_y: 400 },
      { id: randomUUID(), workspace_id: WS, node_type: "solution", title: "SECRET-OTHER-NODE", position_x: 100, position_y: 400 },
    ]).throwOnError();

    const { link, token } = await createShareLink(svc, WS, PRIVATE_USER, { conversationId: C1, expiresInDays: 7 });
    check("a link can be created for one conversation", Boolean(link.id) && token.length === 32 && link.conversationTitle === "Shared chat");

    clearShareCache();
    const view = await loadPublicView(svc, token);
    const json = JSON.stringify(view);
    check("the public view loads from the real database", view !== null && view.title === "Shared chat");
    check("it shows only this conversation's own canvas (2 nodes, 1 edge)", view?.canvas.nodes.length === 2 && view?.canvas.edges.length === 1);
    check("it does not draw the merged workspace canvas", !json.includes("MERGED-A") && !json.includes("SECRET-OTHER-NODE"));
    check("it shows this conversation's discussion, user and assistant only, in order", view?.conversation.messages.map((m) => m.role).join() === "user,assistant");
    check("the other conversation is not reachable at all", !json.includes("SECRET-OTHER-MESSAGE") && !json.includes("Private other chat") && !("conversations" in (view ?? {})));
    check("no system messages, user ids, emails or workspace name leak", !json.includes("SYSTEM-SECRET") && !json.includes(PRIVATE_USER) && !json.includes("private.person") && !json.includes("SHARE-AUDIT-TEMP-WORKSPACE-NAME"));

    const listed = await listActiveShareLinks(svc, WS);
    check("the owner sees the link with its conversation's title", listed.length === 1 && listed[0].conversationTitle === "Shared chat");

    const foreign = await createShareLink(svc, WS, PRIVATE_USER, { conversationId: randomUUID(), expiresInDays: 7 }).then(() => "created", (e: { code?: string }) => e.code);
    check("an unknown conversation cannot be published", foreign === "NOT_FOUND");

    const { data: anonRead, error: anonErr } = await anon.from("workspace_public_links").select("token_hash").limit(1);
    check("an anonymous visitor cannot read the links table directly", (anonRead?.length ?? 0) === 0, anonErr ? anonErr.message.slice(0, 50) : "no rows");
    const { error: anonWrite } = await anon.from("workspace_public_links").insert({ workspace_id: WS, token_hash: "forged", created_by: "x" });
    check("an anonymous visitor cannot create a link", Boolean(anonWrite), anonWrite?.message.slice(0, 50));

    // A workspace-wide link (the old kind) must serve nothing.
    clearShareCache();
    const legacyToken = "L".repeat(32);
    const { hashInviteToken } = await import("../src/app/lib/invites/inviteToken");
    await svc.from("workspace_public_links").insert({ workspace_id: WS, token_hash: hashInviteToken(legacyToken), created_by: PRIVATE_USER, conversation_id: null }).throwOnError();
    check("an old workspace-wide link serves nothing", (await loadPublicView(svc, legacyToken)) === null);

    const base = process.env.LIVE_BASE_URL;
    if (base) {
      const r = await fetch(`${base}/api/public/${token}`);
      const body = await r.json();
      check(`HTTP: the running app serves the view (${base})`, r.status === 200 && body.title === "Shared chat" && !JSON.stringify(body).includes("SECRET-OTHER"), `status=${r.status}`);
      const r2 = await fetch(`${base}/api/public/${token}?v=${body.etag}`);
      check("HTTP: polling with the current tag returns 'unchanged'", (await r2.json()).unchanged === true);
      const page = await fetch(`${base}/share/${token}`);
      check("HTTP: the share page renders without signing in", page.status === 200);
    } else {
      console.log("(set LIVE_BASE_URL to also test a running app over HTTP)");
    }

    await revokeShareLink(svc, WS, link.id);
    check("after revoking, the link stops working immediately", (await loadPublicView(svc, token)) === null);
    if (base) {
      // The running app is another process with its own 4 s cache, so a revoke made elsewhere can take
      // up to that long to show (a revoke made through the app itself is immediate).
      await new Promise((r) => setTimeout(r, 5000));
      check("HTTP: and the running app answers 404 within the 4 s cache window", (await fetch(`${base}/api/public/${token}`)).status === 404);
    }
  } catch (e) {
    failure = e;
  } finally {
    await svc.from("workspaces").delete().eq("id", WS); // cascades to everything above
    const { count } = await svc.from("workspaces").select("id", { count: "exact", head: true }).eq("id", WS);
    console.log(`\ncleanup: temp workspace remaining=${count ?? 0}`);
  }
  if (failure) {
    console.error("\nPROBE ERROR:", failure instanceof Error ? failure.message : failure);
    process.exit(2);
  }
  console.log(`\n${bad === 0 ? "all checks passed" : bad + " problem(s)"}`);
  process.exit(bad ? 1 : 0);
}

void run();
