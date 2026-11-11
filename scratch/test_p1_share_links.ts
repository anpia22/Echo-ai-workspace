/**
 * Public share links: read-only view for anonymous visitors.
 *
 * Covers what the public view can contain (an allow-list: no user ids, emails, system messages or
 * metadata), link lifetime and revocation, scoping to one workspace, the short cache, and the
 * wiring of the routes, page and controls. A fake Supabase client stands in for the database.
 *
 * Run: npx tsx scratch/test_p1_share_links.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIMITS,
  buildPublicView,
  computeEtag,
  evaluateShareLink,
  parseCreateShare,
} from "../src/app/lib/share/shareLogic";
import { clearShareCache, createShareLink, listActiveShareLinks, loadPublicView, revokeShareLink } from "../src/app/lib/share/shareStore";
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
const NOW = new Date("2026-11-10T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
  token: "TOKEN-HASH-SHOULD-NEVER-LEAK",
  meta: "INTERNAL-METADATA-MARKER",
  system: "SYSTEM-PROMPT-MARKER",
};

function seed(): Record<string, Row[]> {
  return {
    workspaces: [
      { id: WS_A, title: "Roadmap debate", revision: 7, settings: { secret: SECRET.meta }, description: "internal" },
      { id: WS_B, title: "Other team", revision: 2 },
    ],
    canvas_nodes: [
      { id: "n1", workspace_id: WS_A, node_type: "problem", title: "Slow onboarding", description: "Users drop at step 2", position_x: 10, position_y: 20, metadata: { m: SECRET.meta }, version: 3 },
      { id: "n2", workspace_id: WS_A, node_type: "solution", title: "Shorter flow", description: null, position_x: 300, position_y: 20 },
      { id: "nb", workspace_id: WS_B, node_type: "idea", title: "OTHER WORKSPACE NODE", position_x: 0, position_y: 0 },
    ],
    canvas_edges: [
      { id: "e1", workspace_id: WS_A, source_id: "n1", target_id: "n2", relationship: "solves" },
      { id: "e-bad", workspace_id: WS_A, source_id: "n1", target_id: "missing", relationship: "x" },
      { id: "eb", workspace_id: WS_B, source_id: "nb", target_id: "nb", relationship: "OTHER" },
    ],
    canvas_groups: [{ id: "g1", workspace_id: WS_A, title: "Onboarding", member_ids: ["n1", "n2", "ghost"], color: "#fff" }],
    conversations: [
      { id: "c1", workspace_id: WS_A, title: "Why drop-off?", updated_at: iso(NOW.getTime() - 1000), metadata: { canvas: SECRET.meta } },
      { id: "c2", workspace_id: WS_A, title: "Older chat", updated_at: iso(NOW.getTime() - 9000) },
      { id: "cb", workspace_id: WS_B, title: "OTHER WORKSPACE CHAT", updated_at: iso(NOW.getTime()) },
    ],
    messages: [
      { id: "m2", workspace_id: WS_A, conversation_id: "c1", role: "assistant", content: "Try cutting step 2.", sender_id: SECRET.userId, metadata: { m: SECRET.meta }, sequence: 2, created_at: iso(NOW.getTime() - 500) },
      { id: "m1", workspace_id: WS_A, conversation_id: "c1", role: "user", content: "Where do users drop off?", sender_id: SECRET.userId, created_at: iso(NOW.getTime() - 900) },
      { id: "ms", workspace_id: WS_A, conversation_id: "c1", role: "system", content: SECRET.system, created_at: iso(NOW.getTime() - 950) },
      { id: "mb", workspace_id: WS_B, conversation_id: "cb", role: "user", content: "OTHER WORKSPACE MESSAGE", created_at: iso(NOW.getTime()) },
    ],
    workspace_public_links: [],
    workspace_members: [{ workspace_id: WS_A, user_id: SECRET.userId, display_name: SECRET.email, role: "owner" }],
    meetings: [{ id: "mt1", workspace_id: WS_A, title: "MEETING-TITLE-MARKER" }],
    meeting_transcript_segments: [{ id: "t1", content: "TRANSCRIPT-MARKER" }],
  };
}

async function main() {
  console.log("input rules");
  check("default lifetime is 30 days", (() => { const r = parseCreateShare({}); return r.ok && r.value.expiresInDays === 30; })());
  check("7, 90 and never (0) accepted", [7, 90, 0].every((d) => parseCreateShare({ expiresInDays: d }).ok));
  check("odd lifetimes rejected", !parseCreateShare({ expiresInDays: 5 }).ok && !parseCreateShare({ expiresInDays: "30" }).ok && !parseCreateShare({ expiresInDays: -1 }).ok);
  check("non-object body means defaults", parseCreateShare(null).ok);
  check("a live link is valid", evaluateShareLink({ expiresAt: iso(NOW.getTime() + DAY), revokedAt: null }, NOW).ok);
  check("a never-expiring link is valid", evaluateShareLink({ expiresAt: null, revokedAt: null }, NOW).ok);
  check("an expired link is refused", (() => { const r = evaluateShareLink({ expiresAt: iso(NOW.getTime() - 1), revokedAt: null }, NOW); return !r.ok && r.reason === "expired"; })());
  check("a revoked link is refused", (() => { const r = evaluateShareLink({ expiresAt: null, revokedAt: iso(NOW.getTime()) }, NOW); return !r.ok && r.reason === "revoked"; })());

  console.log("the public view is an allow-list");
  const t = seed();
  const view = buildPublicView({
    workspace: t.workspaces[0], nodes: t.canvas_nodes.filter((n) => n.workspace_id === WS_A), edges: t.canvas_edges.filter((e) => e.workspace_id === WS_A),
    groups: t.canvas_groups, conversations: t.conversations.filter((c) => c.workspace_id === WS_A), messages: t.messages.filter((m) => m.workspace_id === WS_A), now: NOW,
  });
  const json = JSON.stringify(view);
  check("shows the workspace title and revision", view.workspace.title === "Roadmap debate" && view.revision === 7);
  check("shows canvas nodes with position", view.canvas.nodes.length === 2 && view.canvas.nodes[0].position.x === 10 && view.canvas.nodes[0].description === "Users drop at step 2");
  check("a node without a description has none", !("description" in view.canvas.nodes[1]));
  check("edges that point at missing nodes are dropped", view.canvas.edges.length === 1 && view.canvas.edges[0].relationship === "solves");
  check("group members are limited to real nodes", JSON.stringify(view.canvas.groups[0].memberIds) === JSON.stringify(["n1", "n2"]));
  check("messages are in time order per conversation", view.conversations[0].messages.map((m) => m.id).join() === "m1,m2");
  check("system messages are never included", !json.includes(SECRET.system) && view.conversations[0].messages.every((m) => m.role === "user" || m.role === "assistant"));
  check("no user ids anywhere", !json.includes(SECRET.userId) && !/sender|user_id|created_by/i.test(json));
  check("no emails or display names anywhere", !json.includes(SECRET.email) && !json.includes("secret.person"));
  check("no metadata, settings or internal columns", !json.includes(SECRET.meta) && !/metadata|settings|token|sequence|version/i.test(json));
  check("no meeting data", !json.includes("MEETING-TITLE-MARKER") && !json.includes("TRANSCRIPT-MARKER"));
  check("exact top-level shape", Object.keys(view).sort().join() === "canvas,conversations,etag,generatedAt,revision,workspace");
  check("exact message shape", Object.keys(view.conversations[0].messages[0]).sort().join() === "content,createdAt,id,role");

  console.log("limits");
  const big = buildPublicView({
    workspace: { title: "x".repeat(LIMITS.titleChars * 3), revision: 1 },
    nodes: Array.from({ length: LIMITS.nodes + 50 }, (_, i) => ({ id: `n${i}`, node_type: "idea", title: "t", position_x: 0, position_y: 0 })),
    edges: [], groups: [], conversations: [{ id: "c", title: "t", updated_at: "x" }],
    messages: [{ id: "m", conversation_id: "c", role: "user", content: "y".repeat(LIMITS.messageChars * 2), created_at: "1" }], now: NOW,
  });
  check("oversized lists are capped", big.canvas.nodes.length === LIMITS.nodes);
  check("long titles and messages are truncated", big.workspace.title.length === LIMITS.titleChars && big.conversations[0].messages[0].content.length === LIMITS.messageChars);

  console.log("change detection");
  const again = buildPublicView({ workspace: t.workspaces[0], nodes: t.canvas_nodes.filter((n) => n.workspace_id === WS_A), edges: t.canvas_edges.filter((e) => e.workspace_id === WS_A), groups: t.canvas_groups, conversations: t.conversations.filter((c) => c.workspace_id === WS_A), messages: t.messages.filter((m) => m.workspace_id === WS_A), now: new Date(NOW.getTime() + 60_000) });
  check("same content gives the same tag, even at another time", again.etag === view.etag);
  const changed = buildPublicView({ workspace: t.workspaces[0], nodes: t.canvas_nodes.filter((n) => n.workspace_id === WS_A), edges: [], groups: [], conversations: t.conversations.filter((c) => c.workspace_id === WS_A), messages: t.messages.filter((m) => m.workspace_id === WS_A), now: NOW });
  check("different content gives a different tag", changed.etag !== view.etag);
  check("the tag is short and stable", /^[0-9a-z]{6,14}$/.test(view.etag) && computeEtag({ a: 1 }) === computeEtag({ a: 1 }));

  console.log("store: create / list / revoke");
  {
    const f = fakeClient(seed());
    const created = await createShareLink(f.client, WS_A, "owner-1", { expiresInDays: 30 }, NOW);
    check("token is long and url-safe", /^[A-Za-z0-9_-]{32}$/.test(created.token));
    const stored = f.tables.workspace_public_links[0];
    check("only the hash is stored, never the token", stored.token_hash === hashInviteToken(created.token) && !JSON.stringify(f.tables.workspace_public_links).includes(created.token));
    check("expiry is set 30 days out", stored.expires_at === iso(NOW.getTime() + 30 * DAY));
    check("summary exposes no token or hash", !JSON.stringify(created.link).includes("hash") && Object.keys(created.link).sort().join() === "createdAt,expiresAt,id");
    const never = await createShareLink(f.client, WS_A, "owner-1", { expiresInDays: 0 }, NOW);
    check("0 days means no expiry", f.tables.workspace_public_links[1].expires_at === null && never.link.expiresAt === null);
    f.tables.workspace_public_links.push({ id: "old", workspace_id: WS_A, token_hash: "h", created_at: iso(NOW.getTime() - 100 * DAY), expires_at: iso(NOW.getTime() - DAY), revoked_at: null });
    f.tables.workspace_public_links.push({ id: "gone", workspace_id: WS_A, token_hash: "h2", created_at: iso(NOW.getTime()), expires_at: null, revoked_at: iso(NOW.getTime()) });
    const listed = await listActiveShareLinks(f.client, WS_A, NOW);
    check("list shows only active links (not expired or revoked)", listed.length === 2);
    check("list is scoped to the workspace", (await listActiveShareLinks(f.client, WS_B, NOW)).length === 0);
    await revokeShareLink(f.client, WS_A, created.link.id, NOW);
    check("revoke marks the link", f.tables.workspace_public_links[0].revoked_at === iso(NOW.getTime()));
    const missing = await revokeShareLink(f.client, WS_A, "nope", NOW).then(() => null, (e: { code?: string }) => e.code);
    check("revoking an unknown link -> NOT_FOUND", missing === "NOT_FOUND");
    const crossWs = await revokeShareLink(f.client, WS_B, never.link.id, NOW).then(() => null, (e: { code?: string }) => e.code);
    check("revoke is scoped to the workspace", crossWs === "NOT_FOUND");
  }

  console.log("store: serving the public view");
  {
    clearShareCache();
    const f = fakeClient(seed());
    const { token } = await createShareLink(f.client, WS_A, "owner-1", { expiresInDays: 30 }, NOW);
    const v = await loadPublicView(f.client, token, NOW);
    check("a valid token returns the view", v !== null && v.workspace.title === "Roadmap debate");
    const out = JSON.stringify(v);
    check("it contains only that workspace's data", !out.includes("OTHER WORKSPACE") && !out.includes("Other team"));
    check("and none of the private data", !out.includes(SECRET.userId) && !out.includes(SECRET.email) && !out.includes(SECRET.system) && !out.includes(SECRET.meta) && !out.includes("MEETING-TITLE-MARKER") && !out.includes("TRANSCRIPT-MARKER"));

    check("an unknown token returns null", (await loadPublicView(f.client, "x".repeat(32), NOW)) === null);

    const before = f.queryCount();
    await loadPublicView(f.client, token, new Date(NOW.getTime() + 1000));
    check("a repeat within a few seconds is served from the cache (no database reads)", f.queryCount() === before);
    await loadPublicView(f.client, token, new Date(NOW.getTime() + 5000));
    check("after the cache lifetime it reads again", f.queryCount() > before);

    // Revoking takes effect immediately on this server, even inside the cache window.
    clearShareCache();
    await loadPublicView(f.client, token, NOW);
    const linkId = f.tables.workspace_public_links[0].id as string;
    await revokeShareLink(f.client, WS_A, linkId, NOW);
    check("a revoked link stops working at once (cache cleared)", (await loadPublicView(f.client, token, new Date(NOW.getTime() + 500))) === null);

    // Expiry holds even for a cached view.
    clearShareCache();
    const short = fakeClient(seed());
    const s = await createShareLink(short.client, WS_A, "o", { expiresInDays: 7 }, NOW);
    await loadPublicView(short.client, s.token, new Date(NOW.getTime() + 6 * DAY));
    check("an expired link returns null", (await loadPublicView(short.client, s.token, new Date(NOW.getTime() + 8 * DAY))) === null);
    clearShareCache();
    const exp = fakeClient(seed());
    exp.tables.workspace_public_links.push({ id: "e", workspace_id: WS_A, token_hash: hashInviteToken("E".repeat(32)), created_at: iso(NOW.getTime()), expires_at: iso(NOW.getTime() + 2000), revoked_at: null });
    await loadPublicView(exp.client, "E".repeat(32), NOW);
    check("a cached view is dropped once the link expires", (await loadPublicView(exp.client, "E".repeat(32), new Date(NOW.getTime() + 3000))) === null);

    // A link only ever shows its own workspace.
    clearShareCache();
    const two = fakeClient(seed());
    const b = await createShareLink(two.client, WS_B, "o", { expiresInDays: 30 }, NOW);
    const vb = await loadPublicView(two.client, b.token, NOW);
    check("a link for workspace B shows only B", vb !== null && vb.workspace.title === "Other team" && !JSON.stringify(vb).includes("Roadmap debate"));
  }

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const pub = read("src/app/api/public/[token]/route.ts");
  check("public route needs no sign-in and checks no user", !/resolveServerActor|resolveServerIdentity|requireWorkspace/.test(pub));
  check("public route refuses malformed tokens before the database", pub.indexOf("isPlausibleInviteToken(token)") !== -1 && pub.indexOf("isPlausibleInviteToken(token)") < pub.indexOf("loadPublicView("));
  check("unknown, revoked and expired all get the same 404", (pub.match(/notFound\(\)/g) ?? []).length >= 2 && !/revoked|expired/.test(pub.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  check("public route is rate-limited per visitor", /MemoryWindowCounter/.test(pub) && /429/.test(pub) && /Retry-After/.test(pub));
  check("public responses are never cached or indexed", /no-store/.test(pub) && /noindex/.test(pub) && /no-referrer/.test(pub));
  check("polling returns a tiny unchanged answer", /unchanged: true/.test(pub));
  const mgmt = [read("src/app/api/workspace/[workspaceId]/share/route.ts"), read("src/app/api/workspace/[workspaceId]/share/[linkId]/route.ts")];
  check("create, list and revoke are owner/admin only", mgmt.every((m) => /\["owner", "admin"\]/.test(m)) && (mgmt[0].match(/\["owner", "admin"\]/g) ?? []).length === 2);
  const page = read("src/app/share/[token]/page.tsx");
  check("the page shows messages as plain text (no HTML injection)", !/dangerouslySetInnerHTML|innerHTML/.test(page));
  check("the page is read-only and polls with the content tag", /readOnly/.test(page) && /\?v=/.test(page) && /POLL_MS/.test(page));
  check("the page stops polling when the link is gone and when the tab is hidden", /status === 404/.test(page) && /document\.hidden/.test(page));
  const layout = read("src/app/share/[token]/layout.tsx");
  check("the share page is not indexed and sends no referrer", /index: false/.test(layout) && /referrer: "no-referrer"/.test(layout));
  const sql = read("supabase/migrations/20261110020000_p1_public_share_links.sql");
  check("migration: server-only table, hash only", /token_hash TEXT NOT NULL UNIQUE/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON workspace_public_links FROM anon, authenticated/.test(sql) && !/CREATE POLICY/i.test(sql) && !/\btoken TEXT/.test(sql));
  const dialog = read("src/app/components/auth/MembersDialog.tsx");
  check("controls are shown to owners and admins only", /isManager && \(\s*<section[^>]*>\s*<h3[^>]*>Public link/.test(dialog));
  check("the link is shown once, with a way to turn it off", /not shown again/.test(dialog) && /Turn off/.test(dialog));
  check("the canvas supports read-only", /nodesDraggable=\{!readOnly\}/.test(read("src/app/components/EchoCanvas.tsx")));
  check("viewers also get a read-only canvas in the app", /readOnly=\{isViewOnly\}/.test(read("src/app/app/page.tsx")));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
