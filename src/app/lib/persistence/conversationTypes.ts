/**
 * Phase 13.1 — Persistent Backend Workspace: Conversation & Message Contracts
 *
 * Persistence DTOs for multi-turn chat threads, prompt history, and AI responses.
 *
 * CRITICAL INVARIANTS:
 * - Roles are strictly constrained to existing application semantics: "user" | "assistant" | "system".
 * - Message IDs preserve deterministic client-generated UUIDs for idempotency.
 * - Every message is strictly scoped by conversationId AND workspaceId.
 */

import type {
  ConversationId,
  IsoTimestampString,
  MessageId,
  UserId,
  WorkspaceId,
} from "./types";

/**
 * Message authorship roles.
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Durable Conversation thread record.
 */
export type ConversationRecord = {
  id: ConversationId;
  workspaceId: WorkspaceId;
  title: string;
  createdAt: IsoTimestampString;
  updatedAt: IsoTimestampString;
  metadata?: Record<string, unknown>;
};

/**
 * Durable individual message within a conversation.
 */
export type MessageRecord = {
  id: MessageId;
  conversationId: ConversationId;
  workspaceId: WorkspaceId;
  role: MessageRole;
  content: string;
  createdAt: IsoTimestampString;
  senderId?: UserId;
  sequence?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Request DTO for creating a new conversation thread in a workspace.
 */
export type CreateConversationRequest = {
  id?: ConversationId;
  workspaceId: WorkspaceId;
  title?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Response DTO after conversation creation.
 */
export type CreateConversationResponse = {
  conversation: ConversationRecord;
};

/**
 * Request DTO for appending a message (user or assistant) to a conversation.
 */
export type AppendMessageRequest = {
  id?: MessageId;
  conversationId: ConversationId;
  workspaceId: WorkspaceId;
  role: MessageRole;
  content: string;
  senderId?: UserId;
  sequence?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Response DTO after message persistence.
 */
export type AppendMessageResponse = {
  message: MessageRecord;
};
