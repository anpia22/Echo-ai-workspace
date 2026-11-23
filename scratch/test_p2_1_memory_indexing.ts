/**
 * P2.1 step 3: semantic memory indexing.
 *
 * Covers the embeddings client (batching, retries, error handling), the text built from nodes and
 * messages, the indexer (skips unchanged text, drops deleted items, never breaks a save) and the
 * wiring in the two save routes. Uses a fake database client and a fake embeddings API: no network.
 *
 * Run: npx tsx scratch/test_p2_1_memory_indexing.ts
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEMORY_BATCH_SIZE, MEMORY_EMBEDDING_DIMENSIONS, MEMORY_MAX_SOURCES_PER_RUN, isMemoryIndexingEnabled } from "../src/app/lib/memory/config";
import { EmbeddingError, embedTexts } from "../src/app/lib/memory/embeddings";
import { indexMemorySources, runMemoryIndexing, toVectorLiteral } from "../src/app/lib/memory/indexer";
import { hashText, messageSource, nodeSource, type MemorySource } from "../src/app/lib/memory/sources";
import { scheduleMessageIndexing, scheduleNodeIndexing } from "../src/app/lib/memory/schedule";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  - " + detail : ""}`);
  }
}

const WS = "11111111-1111-4111-8111-111111111111";
const WS2 = "99999999-9999-4999-8999-999999999999";
const CONV = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `aaaa0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------- fake database client
type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>, opts: { failWrite?: boolean } = {}) {
  const calls = { upserts: [] as Row[][], reads: 0 };
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
      upsert: async (rows: Row[]) => {
        if (opts.failWrite) return { error: { message: "disk full" } };
        calls.upserts.push(rows);
        const t = (tables[table] ??= []);
        for (const row of rows) {
          const i = t.findIndex((x) => x.workspace_id === row.workspace_id && x.source_type === row.source_type && x.source_id === row.source_id);
          if (i >= 0) t[i] = row;
          else t.push(row);
        }
        return { error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        calls.reads++;
        const data = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return b;
  }
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient, tables, calls };
}

// ---------------------------------------------------------------- fake embeddings API
function vec(seed: number): number[] {
  return Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, (_, k) => (k === seed % MEMORY_EMBEDDING_DIMENSIONS ? 1 : 0));
}
function embeddingsFetch(script: Array<number | "network" | "ok" | { status: number; retryAfter?: string }> = []) {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  let step = 0;
  const f = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ body });
    const next = script[step++] ?? "ok";
    if (next === "network") throw new TypeError("fetch failed");
    if (typeof next === "number" || (typeof next === "object" && next !== null)) {
      const status = typeof next === "number" ? next : next.status;
      const headers = new Headers(typeof next === "object" && next.retryAfter ? { "retry-after": next.retryAfter } : {});
      return new Response(JSON.stringify({ error: "x" }), { status, headers });
    }
    const input = body.input as string[];
    // Return out of order to prove the client sorts by index.
    const data = input.map((_t, i) => ({ index: i, embedding: vec(i) })).reverse();
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const noSleep = () => {
  const waits: number[] = [];
  return { sleep: async (ms: number) => void waits.push(ms), waits };
};

async function main() {
  console.log("config");
  check("indexing is off without a key", !isMemoryIndexingEnabled({}));
  check("indexing is off with the placeholder key", !isMemoryIndexingEnabled({ NVIDIA_API_KEY: "mock-nvidia-key" }));
  check("indexing is on with a key", isMemoryIndexingEnabled({ NVIDIA_API_KEY: "nvapi-abc" }));
  check("indexing can be switched off", !isMemoryIndexingEnabled({ NVIDIA_API_KEY: "nvapi-abc", MEMORY_INDEXING_DISABLED: "true" }));

  console.log("source text");
  const n = nodeSource({ id: id(1), nodeType: "decision", title: "Use Postgres", description: "We need vector search" });
  check("a node becomes 'type: title. description'", n?.text === "decision: Use Postgres. We need vector search" && n.type === "node");
  check("a node without a description still works", nodeSource({ id: id(1), nodeType: "idea", title: "Dark mode" })?.text === "idea: Dark mode");
  check("a node without a title is skipped", nodeSource({ id: id(1), nodeType: "idea", title: "  " }) === null);
  check("a node with a bad id is skipped", nodeSource({ id: "not-a-uuid", nodeType: "idea", title: "Dark mode" }) === null);
  check("a node with no type is labelled note", nodeSource({ id: id(1), title: "Remember the milk" })?.text.startsWith("note: ") === true);
  check("very short text is skipped", nodeSource({ id: id(1), nodeType: "x", title: "a" }) === null);
  check("long text is cut", (nodeSource({ id: id(1), nodeType: "idea", title: "x".repeat(20000) })?.text.length ?? 0) <= 6000);
  check("whitespace is collapsed", nodeSource({ id: id(1), nodeType: "idea", title: "a\n\n  b\t c   d e" })?.text === "idea: a b c d e");
  const m = messageSource({ id: id(2), role: "user", content: "We decided to ship on Friday", conversationId: CONV });
  check("a user message is indexed with its conversation", m?.type === "message" && m.conversationId === CONV);
  check("an assistant message is indexed", messageSource({ id: id(2), role: "assistant", content: "Here is a summary of the plan" }) !== null);
  check("a system message is never indexed", messageSource({ id: id(2), role: "system", content: "Workspace created for you" }) === null);
  check("a tiny message is skipped", messageSource({ id: id(2), role: "user", content: "ok" }) === null);
  check("a message with a bad id is skipped", messageSource({ id: "x", role: "user", content: "a long enough message" }) === null);
  check("hashing is stable and sensitive", hashText("a") === hashText("a") && hashText("a") !== hashText("b"));

  console.log("embeddings client");
  {
    const { f, calls } = embeddingsFetch();
    const { sleep } = noSleep();
    const texts = Array.from({ length: 40 }, (_, i) => `text number ${i}`);
    const out = await embedTexts(texts, "passage", { fetch: f, sleep, apiKey: "k" });
    check("40 texts go out in batches of the configured size", calls.length === Math.ceil(40 / MEMORY_BATCH_SIZE) && out.length === 40, `calls=${calls.length}`);
    check("the request names the model, size, type and truncation", calls[0].body.model === "nvidia/nemotron-3.5-embed-1b" && calls[0].body.dimensions === 1024 && calls[0].body.input_type === "passage" && calls[0].body.truncate === "END");
    check("results are returned in input order", out[0][0] === 1 && out[1][1] === 1 && out[2][2] === 1);
    const q = embeddingsFetch();
    await embedTexts(["what did we decide?"], "query", { fetch: q.f, sleep, apiKey: "k" });
    check("a question is sent as a query", q.calls[0].body.input_type === "query");
  }
  {
    const { f, calls } = embeddingsFetch([503, 429, "ok"]);
    const w = noSleep();
    const out = await embedTexts(["hello there world"], "passage", { fetch: f, sleep: w.sleep, apiKey: "k" });
    check("overload (503) and rate limit (429) are retried until it works", out.length === 1 && calls.length === 3);
    check("retries wait, and wait longer each time", w.waits.length === 2 && w.waits[1] > w.waits[0], JSON.stringify(w.waits));
  }
  {
    const { f } = embeddingsFetch([{ status: 429, retryAfter: "2" }, "ok"]);
    const w = noSleep();
    await embedTexts(["hello there world"], "passage", { fetch: f, sleep: w.sleep, apiKey: "k" });
    check("Retry-After is honoured", w.waits[0] === 2000, JSON.stringify(w.waits));
  }
  {
    const { f, calls } = embeddingsFetch(["network", "ok"]);
    const out = await embedTexts(["hello there world"], "passage", { fetch: f, sleep: noSleep().sleep, apiKey: "k" });
    check("a dropped connection is retried", out.length === 1 && calls.length === 2);
  }
  {
    const { f, calls } = embeddingsFetch([410]);
    let err: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: f, sleep: noSleep().sleep, apiKey: "k" }).catch((e) => (err = e));
    check("a retired model (410) fails at once, without retrying", err instanceof EmbeddingError && !err.retryable && calls.length === 1);
  }
  {
    const { f, calls } = embeddingsFetch([401]);
    let err: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: f, sleep: noSleep().sleep, apiKey: "k" }).catch((e) => (err = e));
    check("a bad key (401) is not retried", err instanceof EmbeddingError && calls.length === 1);
  }
  {
    const { f, calls } = embeddingsFetch([503, 503, 503, 503, 503]);
    let err: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: f, sleep: noSleep().sleep, apiKey: "k", maxAttempts: 3 }).catch((e) => (err = e));
    check("it gives up after the maximum attempts", err instanceof EmbeddingError && err.retryable && calls.length === 3);
  }
  {
    const bad = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }), { status: 200 })) as unknown as typeof fetch;
    let err: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: bad, sleep: noSleep().sleep, apiKey: "k" }).catch((e) => (err = e));
    check("a vector of the wrong size is rejected", err instanceof EmbeddingError && /wrong shape/.test(err.message));
    const few = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch;
    let err2: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: few, sleep: noSleep().sleep, apiKey: "k" }).catch((e) => (err2 = e));
    check("a missing result is rejected", err2 instanceof EmbeddingError);
    let err3: unknown;
    await embedTexts(["hello there world"], "passage", { fetch: bad, sleep: noSleep().sleep, apiKey: "" }).catch((e) => (err3 = e));
    check("no key is a clear error", err3 instanceof EmbeddingError && /not configured/.test(err3.message));
  }

  console.log("indexer");
  const node1 = nodeSource({ id: id(1), nodeType: "decision", title: "Use Postgres", description: "for storage" }) as MemorySource;
  const node2 = nodeSource({ id: id(2), nodeType: "idea", title: "Add dark mode to the canvas" }) as MemorySource;
  const msg1 = messageSource({ id: id(3), role: "user", content: "We should ship on Friday", conversationId: CONV }) as MemorySource;
  const liveTables = () => ({
    canvas_nodes: [{ id: id(1), workspace_id: WS }, { id: id(2), workspace_id: WS }],
    messages: [{ id: id(3), workspace_id: WS }],
    memory_chunks: [] as Row[],
  });
  const countingEmbed = () => {
    const seen: string[][] = [];
    return { seen, embed: async (texts: string[]) => (seen.push(texts), texts.map((_t, i) => vec(i))) };
  };
  {
    const db = fakeClient(liveTables());
    const e = countingEmbed();
    const stats = await indexMemorySources(db.client, WS, [node1, node2, msg1], { embed: e.embed });
    check("new items are embedded and stored", stats.embedded === 3 && stats.stored === 3 && db.tables.memory_chunks.length === 3, JSON.stringify(stats));
    const row = db.tables.memory_chunks.find((r) => r.source_id === id(3)) as Row;
    check("a message row keeps its conversation, a node row has none", row.conversation_id === CONV && (db.tables.memory_chunks.find((r) => r.source_id === id(1)) as Row).conversation_id === null);
    check("rows carry text, hash, model and a pgvector literal", row.content === msg1.text && row.content_hash === hashText(msg1.text) && row.embedding_model === "nvidia/nemotron-3.5-embed-1b" && String(row.embedding).startsWith("[") && String(row.embedding).split(",").length === 1024);
    check("rows are scoped to the workspace", db.tables.memory_chunks.every((r) => r.workspace_id === WS));

    const e2 = countingEmbed();
    const again = await indexMemorySources(db.client, WS, [node1, node2, msg1], { embed: e2.embed });
    check("saving the same text again embeds nothing", again.embedded === 0 && again.unchanged === 3 && e2.seen.length === 0, JSON.stringify(again));

    const edited = { ...node1, text: "decision: Use Postgres with pgvector" };
    const e3 = countingEmbed();
    const third = await indexMemorySources(db.client, WS, [edited, node2], { embed: e3.embed });
    check("only the edited item is embedded again", third.embedded === 1 && third.unchanged === 1 && e3.seen[0].length === 1 && e3.seen[0][0] === edited.text, JSON.stringify(third));
    check("the stored row is replaced, not duplicated", db.tables.memory_chunks.length === 3 && (db.tables.memory_chunks.find((r) => r.source_id === id(1)) as Row).content === edited.text);
  }
  {
    const db = fakeClient(liveTables());
    const e = countingEmbed();
    const stats = await indexMemorySources(db.client, WS, [node1, { ...node1, text: "decision: Use Postgres, final" }], { embed: e.embed });
    check("the same item twice in one batch counts once (last wins)", stats.considered === 1 && e.seen[0].length === 1 && e.seen[0][0].endsWith("final"));
  }
  {
    const tables = liveTables();
    tables.canvas_nodes = tables.canvas_nodes.filter((r) => r.id !== id(2)); // deleted while embedding
    const db = fakeClient(tables);
    const stats = await indexMemorySources(db.client, WS, [node1, node2], { embed: countingEmbed().embed });
    check("an item deleted meanwhile is not stored", stats.droppedMissing === 1 && stats.stored === 1 && db.tables.memory_chunks.length === 1 && db.tables.memory_chunks[0].source_id === id(1), JSON.stringify(stats));
  }
  {
    const tables = liveTables();
    tables.canvas_nodes = [{ id: id(1), workspace_id: WS2 }]; // same id exists only in ANOTHER workspace
    const db = fakeClient(tables);
    const stats = await indexMemorySources(db.client, WS, [node1], { embed: countingEmbed().embed });
    check("an item that exists only in another workspace is not stored", stats.stored === 0 && db.tables.memory_chunks.length === 0);
  }
  {
    const tables = liveTables();
    tables.memory_chunks = [{ workspace_id: WS2, source_type: "node", source_id: id(1), content_hash: hashText(node1.text) }];
    const db = fakeClient(tables);
    const e = countingEmbed();
    const stats = await indexMemorySources(db.client, WS, [node1], { embed: e.embed });
    check("another workspace's identical row does not count as already indexed", stats.embedded === 1 && stats.stored === 1);
  }
  {
    const many = Array.from({ length: MEMORY_MAX_SOURCES_PER_RUN + 10 }, (_, i) => ({ type: "node" as const, id: id(1000 + i), text: `idea: item number ${i}` }));
    const tables = liveTables();
    tables.canvas_nodes = many.map((s) => ({ id: s.id, workspace_id: WS }));
    const db = fakeClient(tables);
    const stats = await indexMemorySources(db.client, WS, many, { embed: countingEmbed().embed });
    check("one run is capped and says so", stats.truncated && stats.considered === MEMORY_MAX_SOURCES_PER_RUN);
  }
  {
    const empty = await indexMemorySources(fakeClient(liveTables()).client, WS, [], { embed: countingEmbed().embed });
    check("nothing to index is a no-op", empty.considered === 0 && empty.stored === 0);
  }
  {
    const db = fakeClient(liveTables());
    let threw = false;
    const res = await runMemoryIndexing(db.client, WS, [node1], { embed: async () => { throw new EmbeddingError("down", true); } }).catch(() => ((threw = true), null));
    check("an embedding failure never escapes the background runner", !threw && res === null && db.tables.memory_chunks.length === 0);
    const db2 = fakeClient(liveTables(), { failWrite: true });
    let threw2 = false;
    const res2 = await runMemoryIndexing(db2.client, WS, [node1], { embed: countingEmbed().embed }).catch(() => ((threw2 = true), null));
    check("a database failure never escapes the background runner", !threw2 && res2 === null);
    const ok = await runMemoryIndexing(fakeClient(liveTables()).client, WS, [node1], { embed: countingEmbed().embed });
    check("the background runner returns the stats on success", ok?.stored === 1);
    check("the background runner ignores an empty list", (await runMemoryIndexing(fakeClient(liveTables()).client, WS, [])) === null);
  }
  check("vector literal is pgvector text", toVectorLiteral([1, 0.5, -2]) === "[1,0.5,-2]");

  console.log("hooks (no key configured: must do nothing and never throw)");
  {
    let threw = false;
    try {
      scheduleNodeIndexing(WS, [{ id: id(1), nodeType: "idea", title: "Add dark mode" }]);
      scheduleNodeIndexing(WS, undefined);
      scheduleNodeIndexing(WS, "garbage");
      scheduleNodeIndexing(WS, [null, 5, {}]);
      scheduleMessageIndexing(WS, { id: id(3), role: "user", content: "We should ship on Friday", conversationId: CONV });
      scheduleMessageIndexing(WS, null);
      scheduleMessageIndexing(WS, "garbage");
    } catch {
      threw = true;
    }
    check("hooks never throw, even on garbage input", !threw);
  }

  console.log("wiring");
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const canvasRoute = read("src/app/api/workspace/[workspaceId]/canvas/route.ts");
  check("canvas save schedules node indexing after the mutation succeeded", /mutateCanvas\(actor, mutationReq\)[\s\S]*scheduleNodeIndexing\(workspaceId, mutationReq\.upsertNodes\)[\s\S]*NextResponse\.json\(\s*\{\s*ok: true/.test(canvasRoute));
  const msgRoute = read("src/app/api/workspace/[workspaceId]/conversations/[conversationId]/messages/route.ts");
  check("message save schedules indexing after the message was stored", /appendMessage\([\s\S]*scheduleMessageIndexing\(workspaceId, result\.message\)[\s\S]*status: 201/.test(msgRoute));
  const schedule = read("src/app/lib/memory/schedule.ts");
  check("indexing runs after the response (next/server after)", /import \{ after \} from "next\/server"/.test(schedule) && /after\(safe\)/.test(schedule));
  check("indexing is skipped unless enabled", /isMemoryIndexingEnabled\(\)/.test(schedule));
  const embeddings = read("src/app/lib/memory/embeddings.ts");
  check("the embeddings client is server-side only (no 'use client', key from the environment)", !/use client/.test(embeddings) && /process\.env\.NVIDIA_API_KEY/.test(embeddings));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
