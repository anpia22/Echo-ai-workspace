/**
 * P2.1: hooks used by the save routes. Each call is one line in the route and can never throw or
 * delay the response: the work runs after the response is sent (Next's `after`), and does nothing
 * when indexing is switched off or no embedding key is configured.
 */
import { after } from "next/server";
import { getServerSupabaseClient } from "../persistence/server";
import { isMemoryIndexingEnabled } from "./config";
import { runMemoryIndexing } from "./indexer";
import { messageSource, nodeSource, type MemorySource } from "./sources";

function schedule(task: () => Promise<unknown>): void {
  const safe = () => task().catch(() => undefined);
  try {
    after(safe);
  } catch {
    // Outside a request scope (scripts, tests): just start it, without waiting.
    void safe();
  }
}

function enqueue(workspaceId: string, sources: MemorySource[]): void {
  if (sources.length === 0 || !isMemoryIndexingEnabled()) return;
  schedule(() => runMemoryIndexing(getServerSupabaseClient(), workspaceId, sources));
}

/** After a canvas save succeeded: index the nodes that were created or changed. */
export function scheduleNodeIndexing(workspaceId: string, upsertNodes: unknown): void {
  try {
    if (!Array.isArray(upsertNodes)) return;
    const sources = upsertNodes
      .map((n) => nodeSource(n as Record<string, unknown>))
      .filter((s): s is MemorySource => s !== null);
    enqueue(workspaceId, sources);
  } catch {
    // Indexing must never affect a save.
  }
}

/** After a message was stored: index it (user and assistant messages only). */
export function scheduleMessageIndexing(workspaceId: string, message: unknown): void {
  try {
    const source = messageSource((message ?? {}) as Record<string, unknown>);
    if (source) enqueue(workspaceId, [source]);
  } catch {
    // Indexing must never affect a save.
  }
}
