/**
 * P2.1 live check (real Supabase + real NVIDIA embeddings; spends a few embedding calls).
 *
 * Creates a throwaway workspace, indexes a few notes and messages through the real indexer,
 * searches them with real questions, checks isolation between two workspaces, then deletes
 * everything. Run: npx tsx --env-file=.env.local scratch/live_check_memory.ts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../src/app/lib/memory/embeddings";
import { indexMemorySources, toVectorLiteral } from "../src/app/lib/memory/indexer";
import { messageSource, nodeSource, type MemorySource } from "../src/app/lib/memory/sources";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const WS = randomUUID();
const WS_OTHER = randomUUID();
const CONV = randomUUID();
const N = { db: randomUUID(), calls: randomUUID(), copy: randomUUID(), dark: randomUUID(), other: randomUUID() };
const M = randomUUID();

let bad = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) bad++;
  console.log(`${ok ? "ok      " : "PROBLEM "} ${name}${detail ? "  - " + detail : ""}`);
}

async function ask(workspaceId: string, question: string, count = 5) {
  const [q] = await embedTexts([question], "query");
  const { data, error } = await svc.rpc("match_memory_chunks", { p_workspace_id: workspaceId, p_query_embedding: toVectorLiteral(q), p_match_count: count, p_min_similarity: 0 });
  if (error) throw new Error(error.message);
  return data as Array<{ source_type: string; source_id: string; content: string; similarity: number }>;
}

async function main() {
  try {
    await svc.from("workspaces").insert([{ id: WS, title: "MEMORY-AUDIT-TEMP" }, { id: WS_OTHER, title: "MEMORY-AUDIT-OTHER" }]).throwOnError();
    await svc.from("conversations").insert({ id: CONV, workspace_id: WS, title: "Planning" }).throwOnError();
    const node = (id: string, ws: string, type: string, title: string, description?: string) => ({ id, workspace_id: ws, node_type: type, title, description: description ?? null, position_x: 0, position_y: 0 });
    await svc.from("canvas_nodes").insert([
      node(N.db, WS, "decision", "Use Postgres with pgvector for storage", "We need vector search next to our relational data"),
      node(N.calls, WS, "problem", "Video calls drop on mobile networks", "Users on 4G lose the connection after a minute"),
      node(N.copy, WS, "task", "Write the pricing page copy"),
      node(N.dark, WS, "idea", "Add a dark mode to the canvas"),
      node(N.other, WS_OTHER, "decision", "SECRET: acquisition target is Acme Corp"),
    ]).throwOnError();
    await svc.from("messages").insert({ id: M, conversation_id: CONV, workspace_id: WS, role: "user", content: "Let's launch the public beta on the first Friday of December." }).throwOnError();

    const toSources = (rows: Array<{ id: string; node_type: string; title: string; description: string | null }>) =>
      rows.map((r) => nodeSource({ id: r.id, nodeType: r.node_type, title: r.title, description: r.description })).filter((s): s is MemorySource => s !== null);
    const { data: mine } = await svc.from("canvas_nodes").select("id,node_type,title,description").eq("workspace_id", WS);
    const { data: theirs } = await svc.from("canvas_nodes").select("id,node_type,title,description").eq("workspace_id", WS_OTHER);
    const msg = messageSource({ id: M, role: "user", content: "Let's launch the public beta on the first Friday of December.", conversationId: CONV }) as MemorySource;

    const t0 = Date.now();
    const stats = await indexMemorySources(svc, WS, [...toSources(mine!), msg]);
    check("real indexing stores 4 nodes and 1 message", stats.stored === 5 && stats.embedded === 5, JSON.stringify(stats) + ` ${Date.now() - t0}ms`);
    await indexMemorySources(svc, WS_OTHER, toSources(theirs!));

    const again = await indexMemorySources(svc, WS, [...toSources(mine!), msg]);
    check("indexing the same items again embeds nothing", again.embedded === 0 && again.unchanged === 5, JSON.stringify(again));

    const cases: Array<[string, string]> = [
      ["what database did we choose?", N.db],
      ["why do calls fail on phones?", N.calls],
      ["who is writing the marketing text?", N.copy],
      ["when do we release the beta?", M],
    ];
    for (const [question, expected] of cases) {
      const hits = await ask(WS, question);
      check(`"${question}" finds the right source first`, hits[0]?.source_id === expected, `top="${hits[0]?.content.slice(0, 50)}" sim=${hits[0]?.similarity.toFixed(3)}`);
    }
    const leak = await ask(WS, "what is the acquisition target? Acme Corp");
    check("another workspace's secret never comes back", !leak.some((h) => h.content.includes("SECRET") || h.content.includes("Acme")));
    const theirsHits = await ask(WS_OTHER, "what is the acquisition target?");
    check("the other workspace finds its own item", theirsHits.length === 1 && theirsHits[0].source_id === N.other);

    await svc.from("canvas_nodes").delete().eq("id", N.dark);
    const { count } = await svc.from("memory_chunks").select("id", { count: "exact", head: true }).eq("source_id", N.dark);
    check("deleting a node removes its memory (database trigger)", count === 0);
  } finally {
    await svc.from("workspaces").delete().in("id", [WS, WS_OTHER]);
    const { count } = await svc.from("memory_chunks").select("id", { count: "exact", head: true }).in("workspace_id", [WS, WS_OTHER]);
    console.log(`\ncleanup: leftover memory rows=${count ?? 0}`);
  }
  console.log(bad === 0 ? "\nall good" : `\n${bad} problem(s)`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("PROBE ERROR:", e instanceof Error ? e.message : e);
  process.exit(2);
});
