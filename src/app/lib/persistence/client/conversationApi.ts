/**
 * Phase 13.6 — Client Conversation & Message API Wrapper
 *
 * Client-only HTTP boundary for persisting conversations and messages.
 * Communicates with Next.js /api/workspace/[workspaceId]/conversations routes.
 *
 * CRITICAL INVARIANTS:
 * - Never passes authorization roles or credentials from client.
 * - Maps 409 Conflict to ConversationPersistenceConflictError.
 * - Maps other HTTP errors to ConversationPersistenceApiError.
 * - Browser-safe; zero server dependencies.
 */

import type {
  ConversationRecord,
  MessageRecord,
  MessageRole,
} from "../conversationTypes";

export class ConversationPersistenceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ConversationPersistenceApiError";
    this.code = code;
    this.status = status;
  }
}

export class ConversationPersistenceConflictError extends ConversationPersistenceApiError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "ConversationPersistenceConflictError";
  }
}

export type CreateConversationPayload = {
  id?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type AppendMessagePayload = {
  id?: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
};

/**
 * Persists a newly created conversation to the server.
 */
export async function createConversationApi(
  workspaceId: string,
  payload: CreateConversationPayload
): Promise<ConversationRecord> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceConflictError(
      errorBody?.error?.message || "Conversation conflict detected"
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceApiError(
      errorBody?.error?.code || "HTTP_ERROR",
      errorBody?.error?.message || `Failed to create conversation: HTTP ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return result.conversation;
}

/**
 * Loads a conversation and its messages from the server.
 */
export async function loadConversationApi(
  workspaceId: string,
  conversationId: string
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] }> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceApiError(
      errorBody?.error?.code || "HTTP_ERROR",
      errorBody?.error?.message || `Failed to load conversation: HTTP ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return {
    conversation: result.conversation,
    messages: result.messages || [],
  };
}

/**
 * Loads message history for a conversation from the server.
 */
export async function listConversationMessagesApi(
  workspaceId: string,
  conversationId: string
): Promise<MessageRecord[]> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceApiError(
      errorBody?.error?.code || "HTTP_ERROR",
      errorBody?.error?.message || `Failed to list messages: HTTP ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return result.messages || [];
}

/**
 * Persists a message (user or assistant) to a conversation.
 */
export async function appendMessageApi(
  workspaceId: string,
  conversationId: string,
  payload: AppendMessagePayload
): Promise<MessageRecord> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (response.status === 409) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceConflictError(
      errorBody?.error?.message || "Conflicting duplicate message detected"
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ConversationPersistenceApiError(
      errorBody?.error?.code || "HTTP_ERROR",
      errorBody?.error?.message || `Failed to persist message: HTTP ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return result.message;
}
