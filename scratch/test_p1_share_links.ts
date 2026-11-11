/**
 * Public share links: a read-only view of ONE conversation for anonymous visitors.
 *
 * Reproduces the bug found in use: a workspace with two conversations (each with its own canvas)
 * and a workspace-wide canvas that merges both. A link must show only its own conversation and that
 * conversation's own canvas, never the other conversation, the merged canvas, or the workspace name.
 * Also covers what can never be exposed, link lifetime and revocation, the cache, and the wiring.
 *
 * Run: npx tsx scratch/test_p1_share_links.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITS, buildPublicView, computeEtag, evaluateShareLink, parseCreateShare, sanitizeCanvas } from "../src/app/lib/share/shareLogic";
import { clearShareCache, createShareLink, listActiveShareLinks, listShareableConversations, loadPublicView, revokeShareLink } from "../src/app/lib/share/shareStore";
import { hashInviteToken } from "../src/app/lib/invites/inviteToken";

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

type Row = Record<string, unknown>;
const NOW = new Date("2026-11-11T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C_FOCUS = "c1111111-1111-4111-8111-111111111111"; // "I have a problem of focusing"
const C_APP = "c2222222-2222-4222-8222-222222222222"; // "How to create an application"
const C_OTHER_WS = "c3333333-3333-4333-8333-333333333333";

/** In-memory stand-in for the query calls shareStore makes. Counts reads so caching can be tested. */
function fakeClient(tables: Record<string, Row[]>) {
  let queries = 0;
  let idCounter = 0;
  const from = (table: string) => {
    tables[table] = tables[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row = {};
    let order: { col: string; asc: boolean } | null = null;
    let max = Infinity;

    const exec = (): { data: Row[]; error: null } => {
      queries++;
      if (mode === "insert") {
        const row = { id: `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`, created_at: iso(NOW.getTime()), revoked_at: null, ...inserted };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      let rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        rows.forEach((r) => Object.assign(r, patch));
        return { data: rows, error: null };
      }
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: rows.slice(0, max), error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (row: Row) => ((mode = "insert"), (inserted = row), builder),
      update: (p: Row) => ((mode = "update"), (patch = p), builder),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
      order: (c: string, o: { ascending: boolean }) => ((order = { col: c, asc: o.ascending }), builder),
      limit: (n: number) => ((max = n), builder),
      single: async () => ({ data: exec().data[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: exec().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(exec()),
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, tables, queryCount: () => queries };
}

const SECRET = {
  email: "secret.person@example.com",
  userId: "user-7f3a9c-private",
  meta: "INTERNAL-METADATA-MARKER",
  system: "SYSTEM-PROMPT-MARKER",
  workspaceName: "Anup's Private Workspace Name",
};

const node = (id: string, title: string, x = 100, y = 100, type = "problem", description?: string) => ({ id, nodeType: type, title, ...(description ? { description } : {}), position: { x, y } });

function seed(): Record<string, Row[]> {
  return {
    workspaces: [
      { id: WS_A, title: SECRET.workspaceName, revision: 9, settings: { secret: SECRET.meta } },
      { id: WS_B, title: "Other team" },
    ],
    conversations: [
      {
        id: C_FOCUS, workspace_id: WS_A, title: "I have a problem of focusing", updated_at: iso(NOW.getTime() - 1000),
        metadata: {
          secret: SECRET.meta,
          canvas: {
            nodes: [node("f1", "Switching tasks before finishing", 100, 100, "problem", "Starts one thing then switches."), node("f2", "Time-boxing", 400, 100, "solution"), node("f3", "Problem of focusing", 100, 400)],
            edges: [{ id: "fe1", sourceId: "f2", targetId: "f1", relationship: "solves" }, { id: "fe2", sourceId: "f1", targetId: "f3", relationship: "causes" }, { id: "fe-bad", sourceId: "f1", targetId: "missing" }],
            groups: [{ id: "fg", title: "Focus", memberIds: ["f1", "f2", "ghost"] }],
          },
        },
      },
      {
        id: C_APP, workspace_id: WS_A, title: "How to create an application", updated_at: iso(NOW.getTime() - 9000),
        // Same position as f3 on purpose: this is what overlapped on the merged canvas.
        metadata: { canvas: { nodes: [node("a1", "Application Creation Guidance", 100, 400, "solution", "OTHER-CONVERSATION-NODE-TEXT")], edges: [], groups: [] } },
      },
      { id: C_OTHER_WS, workspace_id: WS_B, title: "OTHER WORKSPACE CHAT", updated_at: iso(NOW.getTime()), metadata: {} },
    ],
    messages: [
      { id: "m2", workspace_id: WS_A, conversation_id: C_FOCUS, role: "assistant", content: "Try cutting step 2.", sender_id: SECRET.userId, metadata: { m: SECRET.meta }, created_at: iso(NOW.getTime() - 500) },
      { id: "m1", workspace_id: WS_A, conversation_id: C_FOCUS, role: "user", content: "Where do users drop off?", sender_id: SECRET.userId, created_at: iso(NOW.getTime() - 900) },
      { id: "ms", workspace_id: WS_A, conversation_id: C_FOCUS, role: "system", content: SECRET.system, created_at: iso(NOW.getTime() - 950) },
      { id: "ma", workspace_id: WS_A, conversation_id: C_APP, role: "user", content: "OTHER-CONVERSATION-MESSAGE how to create an application", created_at: iso(NOW.getTime() - 800) },
      { id: "mb", workspace_id: WS_B, conversation_id: C_OTHER_WS, role: "user", content: "OTHER WORKSPACE MESSAGE", created_at: iso(NOW.getTime()) },
    ],
    // The workspace-wide canvas (what the buggy public page drew): every conversation's nodes together.
    canvas_nodes: [
      { id: "f3", workspace_id: WS_A, node_type: "problem", title: "Problem of focusing", position_x: 100, position_y: 400 },
      { id: "a1", workspace_id: WS_A, node_type: "solution", title: "Application Creation Guidance", position_x: 100, position_y: 400 },
    ],
    workspace_public_links: [],
    workspace_members: [{ workspace_id: WS_A, user_id: SECRET.userId, display_name: SECRET.email, role: "owner" }],
    meetings: [{ id: "mt1", workspace_id: WS_A, title: "MEETING-TITLE-MARKER" }],
    meeting_transcript_segments: [{ id: "t1", content: "TRANSCRIPT-MARKER" }],
  };
}

async function main() {
  console.log("input rules");
  check("a conversation is required", !parseCreateShare({}).ok && !parseCreateShare({ expiresInDays: 7 }).ok);
  check("the conversation id must be a uuid", !parseCreateShare({ conversationId: "abc" }).ok && !parseCreateShare({ conversationId: 5 }).ok && !parseCreateShare({ conversationId: "../etc" }).ok);
  check("default lifetime is 30 days", (() => { const r = parseCreateShare({ conversationId: C_FOCUS }); return r.ok && r.value.expiresInDays === 30 && r.value.conversationId === C_FOCUS; })());
  check("7, 90 and never (0) accepted", [7, 90, 0].every((d) => parseCreateShare({ conversationId: C_FOCUS, expiresInDays: d }).ok));
  check("odd lifetimes rejected", !parseCreateShare({ conversationId: C_FOCUS, expiresInDays: 5 }).ok && !parseCreateShare({ conversationId: C_FOCUS, expiresInDays: "30" }).ok);
  check("non-object body is refused (no conversation)", !parseCreateShare(null).ok);
  check("a live link is valid", evaluateShareLink({ expiresAt: iso(NOW.getTime() + DAY), revokedAt: null }, NOW).ok && evaluateShareLink({ expiresAt: null, revokedAt: null }, NOW).ok);
  check("an expired link is refused", (() => { const r = evaluateShareLink({ expiresAt: iso(NOW.getTime() - 1), revokedAt: null }, NOW); return !r.ok && r.reason === "expired"; })());
  check("a revoked link is refused", (() => { const r = evaluateShareLink({ expiresAt: null, revokedAt: iso(NOW.getTime()) }, NOW); return !r.ok && r.reason === "revoked"; })());

  console.log("canvas sanitising");
  const clean = sanitizeCanvas(seed().conversations[0].metadata && (seed().conversations[0].metadata as Row).canvas);
  check("nodes keep type, title, description and position", clean.nodes.length === 3 && clean.nodes[0].nodeType === "problem" && clean.nodes[0].description === "Starts one thing then switches." && clean.nodes[1].position.x === 400);
  check("edges to missing nodes are dropped", clean.edges.length === 2 && clean.edges.every((e) => ["fe1", "fe2"].includes(e.id)));
  check("group members are limited to real nodes", JSON.stringify(clean.groups[0].memberIds) === JSON.stringify(["f1", "f2"]));
  check("junk canvases become an empty canvas", [null, undefined, "x", 5, [], { nodes: "no" }].every((v) => { const c = sanitizeCanvas(v); return c.nodes.length === 0 && c.edges.length === 0 && c.groups.length === 0; }));
  check("nodes without an id are dropped", sanitizeCanvas({ nodes: [{ title: "no id", position: { x: 1, y: 1 } }, node("ok", "ok")] }).nodes.length === 1);
  check("non-numeric positions become 0, never NaN", (() => { const n = sanitizeCanvas({ nodes: [{ id: "p", nodeType: "idea", title: "t", position: { x: "a", y: NaN } }] }).nodes[0]; return n.position.x === 0 && n.position.y === 0; })());

  console.log("the public view of one conversation (the reported bug)");
  const t = seed();
  const view = buildPublicView({ conversation: t.conversations[0], messages: t.messages.filter((m) => m.workspace_id === WS_A), now: NOW });
  const json = JSON.stringify(view);
  check("it shows the conversation's title", view.title === "I have a problem of focusing");
  check("it shows ONLY this conversation's canvas (3 nodes, not the merged 4)", view.canvas.nodes.length === 3 && view.canvas.nodes.map((n) => n.id).join() === "f1,f2,f3");
  check("nodes from the other conversation do not appear", !json.includes("Application Creation Guidance") && !json.includes("OTHER-CONVERSATION-NODE-TEXT"));
  check("no node overlaps another (the visible symptom)", (() => { const seen = new Set(view.canvas.nodes.map((n) => `${n.position.x},${n.position.y}`)); return seen.size === view.canvas.nodes.length; })());
  check("messages are only this conversation's, in time order", view.conversation.messages.map((m) => m.id).join() === "m1,m2");
  check("the other conversation's messages are not included even if passed in", !json.includes("OTHER-CONVERSATION-MESSAGE"));
  check("system messages are never included", !json.includes(SECRET.system));
  check("the workspace name is not included", !json.includes(SECRET.workspaceName) && !/workspace/i.test(Object.keys(view).join()));
  check("no list of other conversations exists in the view", !("conversations" in view) && !json.includes("How to create an application"));
  check("no user ids, emails or names", !json.includes(SECRET.userId) && !json.includes(SECRET.email) && !/sender|user_id|created_by/i.test(json));
  check("no metadata, settings or internal columns", !json.includes(SECRET.meta) && !/metadata|settings|token|sequence|revision/i.test(json));
  check("no meeting data", !json.includes("MEETING-TITLE-MARKER") && !json.includes("TRANSCRIPT-MARKER"));
  check("exact top-level shape", Object.keys(view).sort().join() === "canvas,conversation,etag,generatedAt,title");
  check("exact message shape", Object.keys(view.conversation.messages[0]).sort().join() === "content,createdAt,id,role");

  console.log("limits and change detection");
  const big = buildPublicView({
    conversation: { id: "c", title: "x".repeat(LIMITS.titleChars * 3), updated_at: "x", metadata: { canvas: { nodes: Array.from({ length: LIMITS.nodes + 50 }, (_, i) => node(`n${i}`, "t", i, i)) } } },
    messages: [{ id: "m", conversation_id: "c", role: "user", content: "y".repeat(LIMITS.messageChars * 2), created_at: "1" }], now: NOW,
  });
  check("oversized canvases are capped", big.canvas.nodes.length === LIMITS.nodes);
  check("long titles and messages are truncated", big.title.length === LIMITS.titleChars && big.conversation.messages[0].content.length === LIMITS.messageChars);
  const again = buildPublicView({ conversation: t.conversations[0], messages: t.messages.filter((m) => m.workspace_id === WS_A), now: new Date(NOW.getTime() + 60_000) });
  check("same content gives the same tag, even at another time", again.etag === view.etag);
  const changed = buildPublicView({ conversation: { ...t.conversations[0], metadata: { canvas: { nodes: [] } } }, messages: t.messages.filter((m) => m.workspace_id === WS_A), now: NOW });
  check("different content gives a different tag", changed.etag !== view.etag && /^[0-9a-z]{6,14}$/.test(view.etag) && computeEtag({ a: 1 }) === computeEtag({ a: 1 }));

  console.log("store: create / list / revoke");
  {
    const f = fakeClient(seed());
    const created = await createShareLink(f.client, WS_A, "owner-1", { conversationId: C_FOCUS, expiresInDays: 30 }, NOW);
    check("token is long and url-safe", /^[A-Za-z0-9_-]{32}$/.test(created.token));
    const stored = f.tables.workspace_public_links[0];
    check("the link is tied to that one conversation", stored.conversation_id === C_FOCUS && stored.workspace_id === WS_A);
    check("only the hash is stored, never the token", stored.token_hash === hashInviteToken(created.token) && !JSON.stringify(f.tables.workspace_public_links).includes(created.token));
    check("expiry is set 30 days out", stored.expires_at === iso(NOW.getTime() + 30 * DAY));
    check("summary names the conversation and exposes no token or hash", created.link.conversationTitle === "I have a problem of focusing" && !JSON.stringify(created.link).includes("hash"));
    const never = await createShareLink(f.client, WS_A, "owner-1", { conversationId: C_APP, expiresInDays: 0 }, NOW);
    check("0 days means no expiry", f.tables.workspace_public_links[1].expires_at === null && never.link.expiresAt === null);

    const foreign = await createShareLink(f.client, WS_A, "owner-1", { conversationId: C_OTHER_WS, expiresInDays: 30 }, NOW).then(() => null, (e: { code?: string }) => e.code);
    check("a conversation from ANOTHER workspace cannot be published", foreign === "NOT_FOUND");
    const missing = await createShareLink(f.client, WS_A, "owner-1", { conversationId: "c9999999-9999-4999-8999-999999999999", expiresInDays: 30 }, NOW).then(() => null, (e: { code?: string }) => e.code);
    check("an unknown conversation cannot be published", missing === "NOT_FOUND");

    f.tables.workspace_public_links.push({ id: "old", workspace_id: WS_A, conversation_id: C_FOCUS, token_hash: "h", created_at: iso(NOW.getTime() - 100 * DAY), expires_at: iso(NOW.getTime() - DAY), revoked_at: null });
    f.tables.workspace_public_links.push({ id: "gone", workspace_id: WS_A, conversation_id: C_FOCUS, token_hash: "h2", created_at: iso(NOW.getTime()), expires_at: null, revoked_at: iso(NOW.getTime()) });
    f.tables.workspace_public_links.push({ id: "legacy", workspace_id: WS_A, conversation_id: null, token_hash: "h3", created_at: iso(NOW.getTime()), expires_at: null, revoked_at: null });
    const listed = await listActiveShareLinks(f.client, WS_A, NOW);
    check("list shows only active per-conversation links (not expired, revoked or workspace-wide)", listed.length === 2 && listed.every((l) => l.conversationTitle.length > 0));
    check("list is scoped to the workspace", (await listActiveShareLinks(f.client, WS_B, NOW)).length === 0);
    const shareable = await listShareableConversations(f.client, WS_A);
    check("only this workspace's conversations can be chosen", shareable.length === 2 && !shareable.some((c) => c.id === C_OTHER_WS));
    check("the chooser lists ids and titles only", shareable.every((c) => Object.keys(c).sort().join() === "id,title"));
    await revokeShareLink(f.client, WS_A, created.link.id, NOW);
    check("revoke marks the link", f.tables.workspace_public_links[0].revoked_at === iso(NOW.getTime()));
    check("revoking an unknown or foreign link -> NOT_FOUND", (await revokeShareLink(f.client, WS_A, "nope", NOW).then(() => null, (e: { code?: string }) => e.code)) === "NOT_FOUND" && (await revokeShareLink(f.client, WS_B, never.link.id, NOW).then(() => null, (e: { code?: string }) => e.code)) === "NOT_FOUND");
  }

  console.log("store: serving the public view");
  {
    clearShareCache();
    const f = fakeClient(seed());
    const { token } = await createShareLink(f.client, WS_A, "owner-1", { conversationId: C_FOCUS, expiresInDays: 30 }, NOW);
    const v = await loadPublicView(f.client, token, NOW);
    const out = JSON.stringify(v);
    check("a valid token returns the view of its conversation", v !== null && v.title === "I have a problem of focusing" && v.canvas.nodes.length === 3);
    check("the merged workspace canvas is never used (no node from the other conversation)", !out.includes("Application Creation Guidance"));
    check("nothing from another conversation, another workspace, or the workspace itself", !out.includes("OTHER-CONVERSATION") && !out.includes("OTHER WORKSPACE") && !out.includes("Other team") && !out.includes(SECRET.workspaceName));
    check("none of the private data", !out.includes(SECRET.userId) && !out.includes(SECRET.email) && !out.includes(SECRET.system) && !out.includes(SECRET.meta) && !out.includes("MEETING-TITLE-MARKER") && !out.includes("TRANSCRIPT-MARKER"));
    check("an unknown token returns null", (await loadPublicView(f.client, "x".repeat(32), NOW)) === null);

    // A second link for the other conversation shows that conversation, and only that one.
    const second = await createShareLink(f.client, WS_A, "owner-1", { conversationId: C_APP, expiresInDays: 30 }, NOW);
    const v2 = await loadPublicView(f.client, second.token, NOW);
    const out2 = JSON.stringify(v2);
    check("the other conversation's link shows its own canvas and chat", v2 !== null && v2.title === "How to create an application" && v2.canvas.nodes.length === 1 && v2.canvas.nodes[0].id === "a1");
    check("…and none of the focusing conversation", !out2.includes("Time-boxing") && !out2.includes("Where do users drop off") && !out2.includes("I have a problem of focusing"));

    const before = f.queryCount();
    await loadPublicView(f.client, token, new Date(NOW.getTime() + 1000));
    check("a repeat within a few seconds is served from the cache (no database reads)", f.queryCount() === before);
    await loadPublicView(f.client, token, new Date(NOW.getTime() + 5000));
    check("after the cache lifetime it reads again", f.queryCount() > before);

    clearShareCache();
    await loadPublicView(f.client, token, NOW);
    await revokeShareLink(f.client, WS_A, f.tables.workspace_public_links[0].id as string, NOW);
    check("a revoked link stops working at once (cache cleared)", (await loadPublicView(f.client, token, new Date(NOW.getTime() + 500))) === null);

    clearShareCache();
    const short = fakeClient(seed());
    const s = await createShareLink(short.client, WS_A, "o", { conversationId: C_FOCUS, expiresInDays: 7 }, NOW);
    await loadPublicView(short.client, s.token, new Date(NOW.getTime() + 6 * DAY));
    check("an expired link returns null", (await loadPublicView(short.client, s.token, new Date(NOW.getTime() + 8 * DAY))) === null);

    clearShareCache();
    const exp = fakeClient(seed());
    exp.tables.workspace_public_links.push({ id: "e", workspace_id: WS_A, conversation_id: C_FOCUS, token_hash: hashInviteToken("E".repeat(32)), created_at: iso(NOW.getTime()), expires_at: iso(NOW.getTime() + 2000), revoked_at: null });
    await loadPublicView(exp.client, "E".repeat(32), NOW);
    check("a cached view is dropped once the link expires", (await loadPublicView(exp.client, "E".repeat(32), new Date(NOW.getTime() + 3000))) === null);

    clearShareCache();
    const legacy = fakeClient(seed());
    legacy.tables.workspace_public_links.push({ id: "l", workspace_id: WS_A, conversation_id: null, token_hash: hashInviteToken("L".repeat(32)), created_at: iso(NOW.getTime()), expires_at: null, revoked_at: null });
    check("an old workspace-wide link (no conversation) serves nothing", (await loadPublicView(legacy.client, "L".repeat(32), NOW)) === null);

    clearShareCache();
    const deleted = fakeClient(seed());
    const d = await createShareLink(deleted.client, WS_A, "o", { conversationId: C_APP, expiresInDays: 30 }, NOW);
    deleted.tables.conversations = deleted.tables.conversations.filter((c) => c.id !== C_APP);
    check("a link whose conversation was deleted serves nothing", (await loadPublicView(deleted.client, d.token, NOW)) === null);

    clearShareCache();
    const tampered = fakeClient(seed());
    tampered.tables.workspace_public_links.push({ id: "t", workspace_id: WS_B, conversation_id: C_FOCUS, token_hash: hashInviteToken("T".repeat(32)), created_at: iso(NOW.getTime()), expires_at: null, revoked_at: null });
    check("a link cannot reach a conversation outside its own workspace", (await loadPublicView(tampered.client, "T".repeat(32), NOW)) === null);
  }

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const store = read("src/app/lib/share/shareStore.ts");
  check("the view never reads the workspace-wide canvas", !/canvas_nodes|canvas_edges|canvas_groups/.test(store));
  check("message and conversation reads are pinned to the link's workspace and conversation", /\.eq\("conversation_id", link\.conversation_id\)/.test(store) && /\.eq\("workspace_id", link\.workspace_id\)/.test(store));
  const pub = read("src/app/api/public/[token]/route.ts");
  check("public route needs no sign-in and checks no user", !/resolveServerActor|resolveServerIdentity|requireWorkspace/.test(pub));
  check("public route refuses malformed tokens before the database", pub.indexOf("isPlausibleInviteToken(token)") !== -1 && pub.indexOf("isPlausibleInviteToken(token)") < pub.indexOf("loadPublicView("));
  check("unknown, revoked and expired all get the same 404", (pub.match(/notFound\(\)/g) ?? []).length >= 2 && !/revoked|expired/.test(pub.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  check("public route is rate-limited, uncached and unindexed", /MemoryWindowCounter/.test(pub) && /429/.test(pub) && /no-store/.test(pub) && /noindex/.test(pub) && /no-referrer/.test(pub));
  const mgmt = [read("src/app/api/workspace/[workspaceId]/share/route.ts"), read("src/app/api/workspace/[workspaceId]/share/[linkId]/route.ts")];
  check("create, list and revoke are owner/admin only", mgmt.every((m) => /\["owner", "admin"\]/.test(m)) && (mgmt[0].match(/\["owner", "admin"\]/g) ?? []).length === 2);
  const page = read("src/app/share/[token]/page.tsx");
  check("the page has no conversation picker and shows the conversation's own title", !/Choose a conversation|<select/.test(page) && /view\?\.title/.test(page));
  check("the page shows messages as plain text (no HTML injection)", !/dangerouslySetInnerHTML|innerHTML/.test(page));
  check("the page is read-only and polls with the content tag", /readOnly/.test(page) && /\?v=/.test(page) && /status === 404/.test(page) && /document\.hidden/.test(page));
  check("the share page is not indexed and sends no referrer", /index: false/.test(read("src/app/share/[token]/layout.tsx")) && /referrer: "no-referrer"/.test(read("src/app/share/[token]/layout.tsx")));
  const sql = read("supabase/migrations/20261110020000_p1_public_share_links.sql") + read("supabase/migrations/20261111000000_p1_public_links_per_conversation.sql");
  check("migrations: server-only table, hash only, no policies", /token_hash TEXT NOT NULL UNIQUE/.test(sql) && /REVOKE ALL ON workspace_public_links FROM anon, authenticated/.test(sql) && !/CREATE POLICY/i.test(sql) && !/\btoken TEXT/.test(sql));
  check("migration adds the conversation and switches off the old workspace-wide links", /ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations\(id\) ON DELETE CASCADE/.test(sql) && /SET revoked_at/.test(sql) && /conversation_id IS NULL/.test(sql));
  const dialog = read("src/app/components/auth/MembersDialog.tsx");
  check("controls: owners/admins choose ONE conversation to share", /isManager && \(\s*<section[^>]*>\s*<h3[^>]*>Public link/.test(dialog) && /Conversation to share/.test(dialog) && /conversationId: shareConversationId/.test(dialog));
  check("the Create button needs a conversation", /disabled=\{busy \|\| !shareConversationId\}/.test(dialog));
  check("the link is shown once, with a way to turn it off", /not shown again/.test(dialog) && /Turn off/.test(dialog));
  check("the canvas supports read-only; viewers get it too", /nodesDraggable=\{!readOnly\}/.test(read("src/app/components/EchoCanvas.tsx")) && /readOnly=\{isViewOnly\}/.test(read("src/app/app/page.tsx")));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
