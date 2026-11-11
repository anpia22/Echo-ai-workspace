/**
 * LIVE Realtime access probe (not part of `npm test`; talks to the real Supabase project).
 *
 * Uses throwaway users and a throwaway workspace, all deleted at the end. Checks, against the
 * real Realtime service, who can join and use a workspace's private room channel, and whether
 * the old public channels are still open.
 *
 * Run: node --env-file=.env.local scratch/live_check_realtime.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("missing Supabase env vars");

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const WS = randomUUID();
const ROOM = `audit-room-${stamp}`;
const created = { users: [], workspace: false };
const clients = [];

const results = [];
const note = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok        " : "PROBLEM   "}  ${name}${detail ? "  - " + detail : ""}`);
};

async function newMember(label, role) {
  const email = `audit-rt-${label}-${stamp}@example.invalid`;
  const password = `Aud!t-${randomUUID()}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  created.users.push(data.user.id);
  if (role) {
    const { error: e2 } = await svc.from("workspace_members").insert({ workspace_id: WS, user_id: data.user.id, display_name: label, role });
    if (e2) throw new Error(`member: ${e2.message}`);
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s, error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`signIn: ${se.message}`);
  await client.realtime.setAuth(s.session.access_token);
  clients.push(client);
  return { id: data.user.id, client };
}

/** Joins a channel; resolves to the final status, or "TIMED_OUT" after 8 s. */
function join(client, topic, { priv }) {
  return new Promise((resolve) => {
    const channel = client.channel(topic, { config: { private: priv, broadcast: { self: false, ack: false } } });
    const timer = setTimeout(() => resolve({ status: "TIMED_OUT", channel }), 8000);
    channel.subscribe((status) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timer);
        resolve({ status, channel });
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  {
    const { error } = await svc.from("workspaces").insert({ id: WS, title: "SECURITY-AUDIT-RT-TEMP" });
    if (error) throw new Error(`workspace: ${error.message}`);
    created.workspace = true;
  }
  const editor = await newMember("editor", "editor");
  const viewer = await newMember("viewer", "viewer");
  const stranger = await newMember("stranger", null);
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  clients.push(anon);

  const topic = `echo-room:${WS}:${ROOM}`;

  console.log("== Private channel: members in, everyone else out ==");
  const a = await join(editor.client, topic, { priv: true });
  note("a member (editor) can join their workspace's private room", a.status === "SUBSCRIBED", `status=${a.status}`);
  const b = await join(viewer.client, topic, { priv: true });
  note("a member (viewer) can join too", b.status === "SUBSCRIBED", `status=${b.status}`);

  if (a.status === "SUBSCRIBED" && b.status === "SUBSCRIBED") {
    const got = [];
    b.channel.on("broadcast", { event: "PING" }, ({ payload }) => got.push(payload));
    await sleep(500);
    await a.channel.send({ type: "broadcast", event: "PING", payload: { n: 1 } });
    await sleep(1500);
    note("a message sent by one member reaches the other", got.length === 1, `received=${got.length}`);
  } else {
    note("a message sent by one member reaches the other", false, "could not join, so it could not be tested");
  }

  const s = await join(stranger.client, topic, { priv: true });
  note("a signed-in stranger CANNOT join that room", s.status !== "SUBSCRIBED", `status=${s.status}`);
  const n = await join(anon, topic, { priv: true });
  note("an anonymous visitor CANNOT join that room", n.status !== "SUBSCRIBED", `status=${n.status}`);
  const old = await join(editor.client, `echo-room:${ROOM}`, { priv: true });
  note("the old un-namespaced topic is refused as a private channel, even for members", old.status !== "SUBSCRIBED", `status=${old.status}`);

  console.log("\n== Public channels (the old way) ==");
  const pub = await join(anon, `echo-room:${ROOM}`, { priv: false });
  // Not counted as a failure: it is a dashboard setting that also decides whether demo mode can collaborate.
  console.log(`${pub.status !== "SUBSCRIBED" ? "ok        " : "OPEN      "}  an anonymous visitor ${pub.status === "SUBSCRIBED" ? "CAN" : "cannot"} still join a PUBLIC room channel  - status=${pub.status}${pub.status === "SUBSCRIBED" ? "  (turn off Realtime > Settings > Allow public access)" : ""}`);
  results.push({ name: "public channels closed", ok: pub.status !== "SUBSCRIBED", informational: true });

  for (const c of [a, b, s, n, old, pub]) {
    try { await c.channel.unsubscribe(); } catch { /* ignore */ }
  }
}

let failure = null;
try {
  await main();
} catch (e) {
  failure = e;
} finally {
  for (const c of clients) { try { await c.removeAllChannels(); } catch { /* ignore */ } }
  if (created.workspace) await svc.from("workspaces").delete().eq("id", WS);
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  console.log(`\ncleanup: temp users deleted=${created.users.length}`);
}
if (failure) {
  console.error("\nPROBE ERROR:", failure.message);
  process.exit(2);
}
const bad = results.filter((r) => !r.ok && !r.informational);
const open = results.filter((r) => !r.ok && r.informational);
console.log(`\n${results.length} checks, ${bad.length} problems${open.length ? `, public access still open` : ""}`);
process.exit(bad.length ? 1 : 0);
