/**
 * P1.3 — What the app's saves look like in the outbox, which failures are temporary, and which
 * consecutive saves can be merged. Pure (no React, no fetch).
 */

import { CanvasPersistenceConflictError, type CanvasPersistenceMutationPayload } from "./canvasApi";
import { ConversationPersistenceConflictError } from "./conversationApi";
import { SaveAbandoned } from "./canvasSaveQueue";
import { ReadOnlyWorkspaceError } from "./readOnly";
import type { OutboxItem, Verdict } from "./outbox";

export type CanvasMutation = Omit<CanvasPersistenceMutationPayload, "expectedBaseRevision">;

export type CanvasSavePayload = { workspaceId: string; mutation: CanvasMutation };
export type ConversationCanvasPayload = { workspaceId: string; conversationId: string; canvas: unknown };
export type MessageSavePayload = {
  workspaceId: string;
  conversationId: string;
  conversationTitle?: string;
  message: { id: string; role: string; content: string };
};

export const KIND_CANVAS = "canvas";
export const KIND_CONVERSATION_CANVAS = "conversation-canvas";
export const KIND_MESSAGE = "message";

export class NoExecutorError extends Error {
  constructor(kind: string) {
    super(`No handler is registered for outbox items of kind '${kind}'`);
    this.name = "NoExecutorError";
  }
}

/** HTTP statuses that usually fix themselves: timeouts, rate limits, server trouble. */
export function isTemporaryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Temporary failures are retried; everything else is abandoned so it cannot block the queue.
 * A stale-revision conflict is NOT temporary here: the canvas save already rebased and retried
 * several times before giving up, so trying the same thing again would not help.
 */
export function classifySaveError(error: unknown): Verdict {
  if (error instanceof ReadOnlyWorkspaceError || error instanceof SaveAbandoned || error instanceof NoExecutorError) return "drop";
  if (error instanceof CanvasPersistenceConflictError || error instanceof ConversationPersistenceConflictError) return "drop";

  // fetch() rejects with a TypeError when the network is down or the connection drops.
  if (error instanceof TypeError) return "retry";
  const e = error as { name?: unknown; status?: unknown } | null;
  if (e && (e.name === "AbortError" || e.name === "TimeoutError")) return "retry";
  if (e && typeof e.status === "number") return isTemporaryStatus(e.status) ? "retry" : "drop";
  return "drop";
}

const NODE_ONLY_KEYS = ["deleteNodeIds", "upsertEdges", "deleteEdgeIds", "upsertGroups", "deleteGroupIds"] as const;

/** True when a mutation only moves or edits nodes (what a drag produces). */
function isNodeOnly(m: CanvasMutation): boolean {
  return Array.isArray(m.upsertNodes) && m.upsertNodes.length > 0 && NODE_ONLY_KEYS.every((k) => !m[k] || m[k]!.length === 0);
}

/**
 * Merges two waiting canvas saves into one when both only upsert nodes (the usual case when
 * dragging while offline): for the same node the newer version wins, so 200 drags become one request.
 * Anything with deletes, edges or groups is kept separate, because ordering matters there.
 */
export function coalesceCanvasSaves(tail: OutboxItem, next: OutboxItem): OutboxItem | null {
  if (tail.kind !== KIND_CANVAS || next.kind !== KIND_CANVAS) return null;
  const a = tail.payload as CanvasSavePayload;
  const b = next.payload as CanvasSavePayload;
  if (a.workspaceId !== b.workspaceId) return null;
  if (!isNodeOnly(a.mutation) || !isNodeOnly(b.mutation)) return null;

  const byId = new Map<string, unknown>();
  for (const n of a.mutation.upsertNodes ?? []) byId.set((n as { id: string }).id, n);
  for (const n of b.mutation.upsertNodes ?? []) byId.set((n as { id: string }).id, n);

  return {
    ...tail,
    payload: {
      workspaceId: a.workspaceId,
      mutation: { upsertNodes: [...byId.values()] as CanvasMutation["upsertNodes"] },
    } satisfies CanvasSavePayload,
  };
}

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `ob-${Date.now().toString(36)}-${counter}`;
}
