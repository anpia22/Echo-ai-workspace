"use client";

/**
 * P1.3 — The app's single outbox, wired to the browser.
 *
 * - One shared queue, so saves from different parts of the app stay in the order they were made.
 * - The browser coming back online (or the tab becoming visible) retries at once.
 * - While anything is unsaved, closing the tab asks the browser to warn the user.
 * - Hooks read the status to show "Offline, N changes waiting".
 *
 * The canvas save needs state that lives in a React hook (the current revision), so that hook
 * registers its own executor. The conversation-canvas and message saves need none, and are
 * registered here.
 */

import { useSyncExternalStore } from "react";
import { createOutbox, type OutboxItem, type OutboxStatus } from "./outbox";
import {
  KIND_CANVAS,
  KIND_CONVERSATION_CANVAS,
  KIND_MESSAGE,
  NoExecutorError,
  classifySaveError,
  coalesceCanvasSaves,
  newItemId,
  type CanvasSavePayload,
  type ConversationCanvasPayload,
  type MessageSavePayload,
} from "./saveOutbox";
import {
  ConversationPersistenceApiError,
  ConversationPersistenceConflictError,
  appendMessageApi,
  createConversationApi,
  updateConversationApi,
} from "./conversationApi";

type Executor = (item: OutboxItem) => Promise<void>;
const executors = new Map<string, Executor>();

/** Registers how to run one kind of item. Returns a function that removes it again. */
export function registerExecutor(kind: string, executor: Executor): () => void {
  executors.set(kind, executor);
  return () => {
    if (executors.get(kind) === executor) executors.delete(kind);
  };
}

type DropListener = (item: OutboxItem, reason: unknown) => void;
const dropListeners = new Set<DropListener>();

/** Called when a save is abandoned because it can never succeed. */
export function onOutboxDrop(listener: DropListener): () => void {
  dropListeners.add(listener);
  return () => dropListeners.delete(listener);
}

export const outbox = createOutbox({
  execute: async (item) => {
    const executor = executors.get(item.kind);
    if (!executor) throw new NoExecutorError(item.kind);
    await executor(item);
  },
  classify: (error) => classifySaveError(error),
  coalesce: coalesceCanvasSaves,
  isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  onDrop: (item, reason) => dropListeners.forEach((l) => l(item, reason)),
});

// ---------------------------------------------------------------------------
// Executors that need no React state
// ---------------------------------------------------------------------------

/** The conversation's own canvas (what the conversation shows, and what a public link shows). */
registerExecutor(KIND_CONVERSATION_CANVAS, async (item) => {
  const p = item.payload as ConversationCanvasPayload;
  await updateConversationApi(p.workspaceId, p.conversationId, { metadata: { canvas: p.canvas } } as never);
});

/**
 * A chat message. Safe to repeat: if an earlier attempt reached the server but its answer was lost,
 * the duplicate id is reported as a conflict, which here means "already saved".
 */
registerExecutor(KIND_MESSAGE, async (item) => {
  const p = item.payload as MessageSavePayload;
  const body = { id: p.message.id, role: p.message.role as never, content: p.message.content };
  try {
    await appendMessageApi(p.workspaceId, p.conversationId, body);
  } catch (err) {
    if (err instanceof ConversationPersistenceConflictError) return; // already saved
    const missing =
      err instanceof ConversationPersistenceApiError &&
      (err.status === 404 || err.code === "NOT_FOUND" || err.message.includes("not found in workspace"));
    if (!missing) throw err;
    // The conversation does not exist on the server yet: create it, then save the message.
    try {
      await createConversationApi(p.workspaceId, { id: p.conversationId, title: p.conversationTitle || "New Conversation" });
    } catch (createErr) {
      if (!(createErr instanceof ConversationPersistenceConflictError)) throw createErr;
    }
    try {
      await appendMessageApi(p.workspaceId, p.conversationId, body);
    } catch (again) {
      if (!(again instanceof ConversationPersistenceConflictError)) throw again;
    }
  }
});

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export function enqueueCanvasSave(payload: CanvasSavePayload): void {
  outbox.enqueue({ id: newItemId(), kind: KIND_CANVAS, payload });
}

/** Only the latest snapshot of a conversation's canvas matters, so waiting ones are replaced. */
export function enqueueConversationCanvasSave(payload: ConversationCanvasPayload): void {
  outbox.enqueue({ id: newItemId(), kind: KIND_CONVERSATION_CANVAS, key: `${KIND_CONVERSATION_CANVAS}:${payload.conversationId}`, payload });
}

export function enqueueMessageSave(payload: MessageSavePayload): void {
  outbox.enqueue({ id: newItemId(), kind: KIND_MESSAGE, payload });
}

// ---------------------------------------------------------------------------
// Browser wiring
// ---------------------------------------------------------------------------

let installs = 0;
let uninstall: (() => void) | null = null;

/** Retry when the connection returns, and warn before the tab closes with unsaved work. Counted, so safe to call from several components. */
export function installOutboxBrowserHooks(): () => void {
  installs++;
  if (installs === 1 && typeof window !== "undefined") {
    const onOnline = () => outbox.kick();
    const onVisible = () => {
      if (!document.hidden) outbox.kick();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (outbox.status().pending > 0) {
        e.preventDefault();
        e.returnValue = ""; // the browser shows its own generic "unsaved changes" message
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onBeforeUnload);
    uninstall = () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }
  return () => {
    installs = Math.max(0, installs - 1);
    if (installs === 0 && uninstall) {
      uninstall();
      uninstall = null;
    }
  };
}

// ---------------------------------------------------------------------------
// React hook: the status, with a stable snapshot (useSyncExternalStore needs one)
// ---------------------------------------------------------------------------

let snapshot: OutboxStatus = outbox.status();
const subscribers = new Set<() => void>();
outbox.subscribe(() => {
  const next = outbox.status();
  if (next.pending !== snapshot.pending || next.state !== snapshot.state || next.dropped !== snapshot.dropped) {
    snapshot = next;
    subscribers.forEach((s) => s());
  }
});

const SERVER_SNAPSHOT: OutboxStatus = { pending: 0, state: "idle", dropped: 0 };

export function useOutboxStatus(): OutboxStatus {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => SERVER_SNAPSHOT
  );
}
