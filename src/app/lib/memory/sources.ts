/**
 * P2.1: turns canvas nodes and chat messages into the text that gets embedded, and hashes it so
 * unchanged items (a node that was only dragged) are never embedded twice.
 */
import { createHash } from "node:crypto";
import { MEMORY_MAX_TEXT_CHARS, MEMORY_MIN_TEXT_CHARS } from "./config";

export type MemorySource = {
  type: "node" | "message";
  id: string;
  /** Messages only; lets a whole conversation's memory be removed with it. */
  conversationId?: string | null;
  text: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MEMORY_MAX_TEXT_CHARS);
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** "decision: Use Postgres. We need vector search." (type word first so the meaning carries). */
export function nodeSource(node: { id?: unknown; nodeType?: unknown; title?: unknown; description?: unknown }): MemorySource | null {
  if (typeof node.id !== "string" || !UUID_REGEX.test(node.id)) return null;
  const title = typeof node.title === "string" ? node.title.trim() : "";
  if (!title) return null;
  const type = typeof node.nodeType === "string" && node.nodeType.trim() ? node.nodeType.trim() : "note";
  const description = typeof node.description === "string" ? node.description.trim() : "";
  const text = clean(`${type}: ${title}${description ? `. ${description}` : ""}`);
  if (text.length < MEMORY_MIN_TEXT_CHARS) return null;
  return { type: "node", id: node.id, text };
}

/** System messages are bookkeeping, not discussion: they are never indexed. */
export function messageSource(message: { id?: unknown; role?: unknown; content?: unknown; conversationId?: unknown }): MemorySource | null {
  if (typeof message.id !== "string" || !UUID_REGEX.test(message.id)) return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.content !== "string") return null;
  const text = clean(message.content);
  if (text.length < MEMORY_MIN_TEXT_CHARS) return null;
  const conversationId = typeof message.conversationId === "string" && UUID_REGEX.test(message.conversationId) ? message.conversationId : null;
  return { type: "message", id: message.id, conversationId, text };
}
