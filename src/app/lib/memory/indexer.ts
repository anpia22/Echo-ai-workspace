/**
 * P2.1: keeps `memory_chunks` in step with the canvas nodes and chat messages that were saved.
 *
 * - Unchanged text (same hash) is never embedded again, so dragging a node costs one small read.
 * - Items deleted while the embedding was in flight are dropped, so memory never points at
 *   something that no longer exists (the delete trigger only covers deletes that happen later).
 * - Failures are logged and swallowed by `runMemoryIndexing`: indexing must never break a save.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../observability/logger";
import { MEMORY_EMBEDDING_MODEL, MEMORY_MAX_SOURCES_PER_RUN, isMemoryIndexingEnabled } from "./config";
import { embedTexts, type EmbeddingInputType } from "./embeddings";
import { hashText, type MemorySource } from "./sources";

export type IndexStats = {
  considered: number;
  unchanged: number;
  embedded: number;
  stored: number;
  droppedMissing: number;
  truncated: boolean;
};

export type IndexerDeps = {
  embed?: (texts: string[], inputType: EmbeddingInputType) => Promise<number[][]>;
};

/** Text form pgvector accepts through the API. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

function key(type: string, id: string): string {
  return `${type}:${id}`;
}

export async function indexMemorySources(
  client: SupabaseClient,
  workspaceId: string,
  sources: MemorySource[],
  deps: IndexerDeps = {}
): Promise<IndexStats> {
  const embed = deps.embed ?? ((texts, inputType) => embedTexts(texts, inputType));

  // Last write wins when the same item appears twice in one batch.
  const byKey = new Map<string, MemorySource>();
  for (const s of sources) byKey.set(key(s.type, s.id), s);
  let list = [...byKey.values()];
  const truncated = list.length > MEMORY_MAX_SOURCES_PER_RUN;
  if (truncated) list = list.slice(0, MEMORY_MAX_SOURCES_PER_RUN);

  const stats: IndexStats = { considered: list.length, unchanged: 0, embedded: 0, stored: 0, droppedMissing: 0, truncated };
  if (list.length === 0) return stats;

  // 1. Which of these are already stored with the same text?
  const existing = await client
    .from("memory_chunks")
    .select("source_type, source_id, content_hash")
    .eq("workspace_id", workspaceId)
    .in("source_id", list.map((s) => s.id));
  if (existing.error) throw new Error(`memory read failed: ${existing.error.message}`);
  const stored = new Map<string, string>();
  for (const row of existing.data ?? []) stored.set(key(row.source_type as string, row.source_id as string), row.content_hash as string);

  const changed = list.filter((s) => stored.get(key(s.type, s.id)) !== hashText(s.text));
  stats.unchanged = list.length - changed.length;
  if (changed.length === 0) return stats;

  // 2. Embed only what changed.
  const vectors = await embed(changed.map((s) => s.text), "passage");
  stats.embedded = changed.length;

  // 3. Drop anything deleted while we were embedding.
  const nodeIds = changed.filter((s) => s.type === "node").map((s) => s.id);
  const messageIds = changed.filter((s) => s.type === "message").map((s) => s.id);
  const alive = new Set<string>();
  if (nodeIds.length) {
    const r = await client.from("canvas_nodes").select("id").eq("workspace_id", workspaceId).in("id", nodeIds);
    if (r.error) throw new Error(`node check failed: ${r.error.message}`);
    for (const row of r.data ?? []) alive.add(key("node", row.id as string));
  }
  if (messageIds.length) {
    const r = await client.from("messages").select("id").eq("workspace_id", workspaceId).in("id", messageIds);
    if (r.error) throw new Error(`message check failed: ${r.error.message}`);
    for (const row of r.data ?? []) alive.add(key("message", row.id as string));
  }

  const rows = [];
  for (let i = 0; i < changed.length; i++) {
    const s = changed[i];
    if (!alive.has(key(s.type, s.id))) {
      stats.droppedMissing++;
      continue;
    }
    rows.push({
      workspace_id: workspaceId,
      source_type: s.type,
      source_id: s.id,
      conversation_id: s.type === "message" ? s.conversationId ?? null : null,
      content: s.text,
      content_hash: hashText(s.text),
      embedding: toVectorLiteral(vectors[i]),
      embedding_model: MEMORY_EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return stats;

  // 4. Store.
  const up = await client.from("memory_chunks").upsert(rows, { onConflict: "workspace_id,source_type,source_id" });
  if (up.error) throw new Error(`memory write failed: ${up.error.message}`);
  stats.stored = rows.length;
  return stats;
}

/** Never throws. Used after a save has already succeeded. */
export async function runMemoryIndexing(
  client: SupabaseClient,
  workspaceId: string,
  sources: MemorySource[],
  deps: IndexerDeps = {}
): Promise<IndexStats | null> {
  if (sources.length === 0) return null;
  const startedAt = Date.now();
  try {
    const stats = await indexMemorySources(client, workspaceId, sources, deps);
    logger.info("memory.index.finished", { workspaceId, ...stats, latencyMs: Date.now() - startedAt });
    return stats;
  } catch (error) {
    logger.warn("memory.index.failed", {
      workspaceId,
      sources: sources.length,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

export { isMemoryIndexingEnabled };
