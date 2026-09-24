/**
 * Phase 13.3 — Conversation Repository
 *
 * Implements server-side persistence for conversations and messages with
 * strict workspace scoping, sequence assignment, and message idempotency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppendMessageRequest,
  AppendMessageResponse,
  ConversationId,
  ConversationRecord,
  CreateConversationRequest,
  CreateConversationResponse,
  MessageRecord,
  WorkspaceId,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  mapConversationRow,
  mapMessageRow,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from "../server";

export class ConversationRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Creates a new conversation thread in the workspace.
   */
  async createConversation(actor: PersistenceActor, req: CreateConversationRequest): Promise<CreateConversationResponse> {
    const { workspaceId, title, metadata } = req;
    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    const finalTitle = (title && title.trim() !== "") ? title.trim() : "New Conversation";

    const { data, error } = await this.client
      .from("conversations")
      .insert({
        id: req.id || undefined,
        workspace_id: workspaceId,
        title: finalTitle,
        metadata: metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", `Failed to create conversation: ${error.message}`);
    }

    return {
      conversation: mapConversationRow(data),
    };
  }

  /**
   * Fetches a conversation by ID, verifying workspace tenancy.
   */
  async getConversation(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    conversationId: ConversationId
  ): Promise<ConversationRecord> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .single();

    if (error || !data) {
      throw new PersistenceError("NOT_FOUND", `Conversation ${conversationId} not found in workspace ${workspaceId}`);
    }

    return mapConversationRow(data);
  }

  /**
   * Lists all conversations in a workspace.
   */
  async listConversations(actor: PersistenceActor, workspaceId: WorkspaceId): Promise<ConversationRecord[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    const { data, error } = await this.client
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapConversationRow);
  }

  /**
   * Updates an existing conversation thread (title and/or metadata).
   */
  async updateConversation(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    conversationId: ConversationId,
    updates: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<ConversationRecord> {
    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof updates.title === "string") {
      const finalTitle = updates.title.trim();
      if (!finalTitle) {
        throw new PersistenceError("VALIDATION_ERROR", "Conversation title cannot be empty");
      }
      updatePayload.title = finalTitle;
    }

    if (updates.metadata && typeof updates.metadata === "object") {
      updatePayload.metadata = updates.metadata;
    }

    const { data, error } = await this.client
      .from("conversations")
      .update(updatePayload)
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .select("*")
      .single();

    if (error || !data) {
      throw new PersistenceError(
        "DATABASE_ERROR",
        `Failed to update conversation: ${error?.message || "Not found"}`
      );
    }

    return mapConversationRow(data);
  }

  /**
   * Updates the title of an existing conversation thread.
   */
  async updateConversationTitle(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    conversationId: ConversationId,
    title: string
  ): Promise<ConversationRecord> {
    return this.updateConversation(actor, workspaceId, conversationId, { title });
  }

  /**
   * Appends a message to a conversation with strict idempotency, concurrency row-locking, and conflict checks.
   */
  async appendMessage(actor: PersistenceActor, req: AppendMessageRequest): Promise<AppendMessageResponse> {
    const { workspaceId, conversationId, role, content, senderId, metadata } = req;

    await requireWorkspaceRole(this.client, workspaceId, actor, ["owner", "admin", "editor", "member"]);

    const VALID_ROLES = new Set(["user", "assistant", "system"]);
    if (!role || !VALID_ROLES.has(role)) {
      throw new PersistenceError("VALIDATION_ERROR", `Invalid message role: '${role}'`);
    }

    if (!content || typeof content !== "string" || content.trim() === "") {
      throw new PersistenceError("VALIDATION_ERROR", "Message content cannot be empty");
    }

    // Try atomic PostgreSQL RPC procedure (handles row lock, idempotency, atomic sequence, tenancy)
    try {
      const { data: rpcData, error: rpcError } = await this.client.rpc("append_message_tx", {
        p_workspace_id: workspaceId,
        p_conversation_id: conversationId,
        p_role: role,
        p_content: content,
        p_sender_id: senderId || actor.userId,
        p_metadata: metadata || {},
        p_id: req.id || null,
      });

      if (!rpcError && rpcData) {
        return {
          message: mapMessageRow(rpcData as Record<string, unknown>),
        };
      }

      if (rpcError) {
        // Map PostgreSQL error codes to domain PersistenceError
        if (rpcError.code === "23505" || rpcError.message.includes("conflicting") || rpcError.message.includes("already exists")) {
          throw new PersistenceError("CONFLICT", rpcError.message);
        }
        if (rpcError.code === "P0002" || rpcError.message.includes("not found in workspace")) {
          throw new PersistenceError("NOT_FOUND", rpcError.message);
        }
        if (rpcError.code === "22023" || rpcError.message.includes("validation") || rpcError.message.includes("Invalid")) {
          throw new PersistenceError("VALIDATION_ERROR", rpcError.message);
        }
        // If RPC function does not exist in mock/test environment, proceed to fallback below
        if (!rpcError.message.includes("could not find the function") && !rpcError.message.includes("function append_message_tx") && rpcError.code !== "42883") {
          throw new PersistenceError("DATABASE_ERROR", `Failed to append message: ${rpcError.message}`);
        }
      }
    } catch (err) {
      if (err instanceof PersistenceError) {
        throw err;
      }
      // If error is not RPC missing, rethrow as DATABASE_ERROR
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("append_message_tx") && !msg.includes("42883")) {
        throw new PersistenceError("DATABASE_ERROR", `Failed to append message: ${msg}`);
      }
    }

    // Fallback: Direct database queries (for mock/in-memory test environments)
    // 1. Verify conversation belongs to this workspace
    const { data: convData, error: convError } = await this.client
      .from("conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !convData) {
      throw new PersistenceError("NOT_FOUND", `Conversation ${conversationId} not found in workspace ${workspaceId}`);
    }

    // 2. Idempotency check if an explicit message ID was supplied
    if (req.id) {
      const { data: existingMsg, error: existError } = await this.client
        .from("messages")
        .select("*")
        .eq("id", req.id)
        .maybeSingle();

      if (existError) {
        throw new PersistenceError("DATABASE_ERROR", existError.message);
      }

      if (existingMsg) {
        // Check for payload equivalence vs conflict
        if (existingMsg.role === role && existingMsg.content === content && existingMsg.conversation_id === conversationId && existingMsg.workspace_id === workspaceId) {
          // Idempotent hit: return existing message
          return { message: mapMessageRow(existingMsg) };
        } else {
          // Conflict: same message ID with differing payload or tenancy
          throw new PersistenceError(
            "CONFLICT",
            `Message ${req.id} already exists with conflicting role or content in conversation ${existingMsg.conversation_id}`
          );
        }
      }
    }

    // 3. Assign server-authoritative sequence count
    const { count } = await this.client
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const nextSequence = (count ?? 0) + 1;

    const { data, error } = await this.client
      .from("messages")
      .insert({
        id: req.id || undefined,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        role,
        content,
        sender_id: senderId || actor.userId,
        sequence: nextSequence,
        metadata: metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new PersistenceError("CONFLICT", `Message ${req.id} already exists`);
      }
      throw new PersistenceError("DATABASE_ERROR", `Failed to append message: ${error.message}`);
    }

    // Touch conversation updated_at
    await this.client
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return {
      message: mapMessageRow(data),
    };
  }

  /**
   * Lists messages in a conversation, ordered chronologically.
   * Strictly validates conversation workspace tenancy.
   */
  async listMessages(
    actor: PersistenceActor,
    workspaceId: WorkspaceId,
    conversationId: ConversationId
  ): Promise<MessageRecord[]> {
    await requireWorkspaceMember(this.client, workspaceId, actor);

    // Verify conversation belongs to this workspace
    const { data: convData, error: convError } = await this.client
      .from("conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !convData) {
      throw new PersistenceError("NOT_FOUND", `Conversation ${conversationId} not found in workspace ${workspaceId}`);
    }

    const { data, error } = await this.client
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new PersistenceError("DATABASE_ERROR", error.message);
    }

    return (data || []).map(mapMessageRow);
  }
}
