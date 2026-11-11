/**
 * LIVE check of public share links against the real Supabase project (not part of `npm test`).
 * Needs migration 20261110020000 applied. Uses a throwaway workspace, removed at the end.
 *
 * Run: npx tsx --env-file=.env.local scratch/live_check_share.ts
 * Optional: LIVE_BASE_URL=http://localhost:3000 also checks the HTTP endpoint of a running app.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getServerSupabaseClient } from "../src/app/lib/persistence/server/db";
import { clearShareCache, createShareLink, loadPublicView, revokeShareLink } from "../src/app/lib/share/shareStore";

const svc = getServerSupabaseClient();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const WS = randomUUID();
const CONV = randomUUID();
const N1 = randomUUID();
const N2 = randomUUID();
const PRIVATE_USER = `private-user-${Date.now()}`;

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok        " : "PROBLEM   "}  ${name}${detail ? "  - " + detail : ""}`);
};

async function main() {
  await svc.from("workspaces").insert({ id: WS, title: "SHARE-AUDIT-TEMP" }).throwOnError();
  await svc.from("workspace_members").insert({ workspace_id: WS, user_id: PRIVATE_USER, display_name: "private.person@example.com", role: "owner" }).throwOnError();
  await svc.from("conversations").insert({ id: CONV, workspace_id: WS, title: "Public chat" }).throwOnError();
  await svc.from("messages").insert([
    { conversation_id: CONV, workspace_id: WS, role: "user", content: "Hello from a participant", sender_id: PRIVATE_USER, created_at: new Date(Date.now() - 2000).toISOString() },
    { conversation_id: CONV, workspace_id: WS, role: "assistant", content: "Hello from Echo", created_at: new Date(Date.now() - 1000).toISOString() },
    { conversation_id: CONV, workspace_id: WS, role: "system", content: "SYSTEM-SECRET", created_at: new Date(Date.now() - 3000).toISOString() },
  ]).throwOnError();
  await svc.from("canvas_nodes").insert([
    { id: N1, workspace_id: WS, node_type: "problem", title: "A problem", position_x: 0, position_y: 0 },
    { id: N2, workspace_id: WS, node_type: "solution", title: "A solution", position_x: 300, position_y: 0 },
  ]).throwOnError();
  await svc.from("canvas_edges").insert({ id: randomUUID(), workspace_id: WS, source_id: N1, target_id: N2, relationship: "solves" }).throwOnError();

  const { link, token } = await createShareLink(svc, WS, PRIVATE_USER, { expiresInDays: 7 });
  check("a link can be created", Boolean(link.id) && token.length === 32);

  clearShareCache();
  const view = await loadPublicView(svc, token);
  const json = JSON.stringify(view);
  check("the public view loads from the real database", view !== null && view.workspace.title === "SHARE-AUDIT-TEMP");
  check("it has the canvas", view?.canvas.nodes.length === 2 && view?.canvas.edges.length === 1);
  check("it has the discussion, user and assistant only, in order", view?.conversations[0]?.messages.map((m) => m.role).join() === "user,assistant");
  check("no system messages, user ids or emails leak", !json.includes("SYSTEM-SECRET") && !json.includes(PRIVATE_USER) && !json.includes("private.person"));

  const { data: anonRead, error: anonErr } = await anon.from("workspace_public_links").select("token_hash").limit(1);
  check("an anonymous visitor cannot read the links table directly", (anonRead?.length ?? 0) === 0, anonErr ? anonErr.message.slice(0, 50) : "no rows");
  const { error: anonWrite } = await anon.from("workspace_public_links").insert({ workspace_id: WS, token_hash: "forged", created_by: "x" });
  check("an anonymous visitor cannot create a link", Boolean(anonWrite), anonWrite?.message.slice(0, 50));

  const base = process.env.LIVE_BASE_URL;
  if (base) {
    const r = await fetch(`${base}/api/public/${token}`);
    const body = await r.json();
    check(`HTTP: the running app serves the public view (${base})`, r.status === 200 && body.workspace?.title === "SHARE-AUDIT-TEMP", `status=${r.status}`);
    const r2 = await fetch(`${base}/api/public/${token}?v=${body.etag}`);
    check("HTTP: polling with the current tag returns 'unchanged'", (await r2.json()).unchanged === true);
  } else {
    console.log("(set LIVE_BASE_URL to also test a running app over HTTP)");
  }

  await revokeShareLink(svc, WS, link.id);
  check("after revoking, the link stops working immediately", (await loadPublicView(svc, token)) === null);
  if (base) check("HTTP: and the running app answers 404", (await fetch(`${base}/api/public/${token}`)).status === 404);
}

async function run() {
  let failure: unknown = null;
  try {
    await main();
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
