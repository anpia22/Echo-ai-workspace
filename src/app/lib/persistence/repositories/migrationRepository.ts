/**
 * Phase 13.9 — Migration Repository
 *
 * Implements server-side validation and atomic execution for migrating legacy
 * localStorage data ("echo-conversations") to PostgreSQL workspaces.
 *
 * Invariants:
 * 1. Server-authoritative actor verification (viewers cannot migrate -> FORBIDDEN 403).
 * 2. Cross-workspace collision detection -> CONFLICT 409.
 * 3. All-or-nothing atomic transaction via `migrate_workspace_tx`.
 * 4. Non-destructive idempotency: preserves existing server conversations/messages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LocalStorageMigrationValidationResult,
  MigrateWorkspaceRequest,
  MigrateWorkspaceResponse,
  WorkspaceId,
} from "../index";
import {
  type PersistenceActor,
  PersistenceError,
  getServerSupabaseClient,
  requireWorkspaceRole,
} from "../server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MigrationRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = getServerSupabaseClient()) {
    this.client = client;
  }

  /**
   * Deep structural validation of untrusted legacy localStorage data.
   */
  validateLegacyData(raw: unknown): LocalStorageMigrationValidationResult {
    const result: LocalStorageMigrationValidationResult = {
      isValid: false,
      totalConversationsFound: 0,
      validConversationCount: 0,
      corruptConversationCount: 0,
      totalMessagesCount: 0,
      totalNodesCount: 0,
      totalEdgesCount: 0,
      totalGroupsCount: 0,
      validationErrors: [],
    };

    if (!Array.isArray(raw)) {
      result.validationErrors.push("Payload root must be an array of conversations");
      return result;
    }

    result.totalConversationsFound = raw.length;

    for (let i = 0; i < raw.length; i++) {
      const conv = raw[i];
      let convValid = true;

      if (!conv || typeof conv !== "object") {
        result.corruptConversationCount++;
        result.validationErrors.push(`Conversation [${i}] is not an object`);
        continue;
      }

      // Check ID
      if (!conv.id || typeof conv.id !== "string" || !UUID_REGEX.test(conv.id)) {
        convValid = false;
        result.validationErrors.push(`Conversation [${i}] has invalid or missing UUID id: "${conv.id}"`);
      }

      // Check title
      if (typeof conv.title !== "string") {
        convValid = false;
        result.validationErrors.push(`Conversation [${i}] title must be a string`);
      }

      // Check messages
      if (!Array.isArray(conv.messages)) {
        convValid = false;
        result.validationErrors.push(`Conversation [${i}] messages must be an array`);
      } else {
        for (let j = 0; j < conv.messages.length; j++) {
          const msg = conv.messages[j];
          if (!msg || typeof msg !== "object") {
            convValid = false;
            result.validationErrors.push(`Conversation [${i}] message [${j}] is not an object`);
            continue;
          }
          if (!msg.id || typeof msg.id !== "string" || !UUID_REGEX.test(msg.id)) {
            convValid = false;
            result.validationErrors.push(`Conversation [${i}] message [${j}] has invalid UUID id: "${msg?.id}"`);
          }
          if (typeof msg.content !== "string") {
            convValid = false;
            result.validationErrors.push(`Conversation [${i}] message [${j}] content must be a string`);
          }
          result.totalMessagesCount++;
        }
      }

      // Check canvas if present
      if (conv.canvas && typeof conv.canvas === "object") {
        if (Array.isArray(conv.canvas.nodes)) {
          for (let k = 0; k < conv.canvas.nodes.length; k++) {
            const node = conv.canvas.nodes[k];
            if (!node || !node.id || !UUID_REGEX.test(node.id)) {
              convValid = false;
              result.validationErrors.push(`Conversation [${i}] canvas node [${k}] has invalid UUID id`);
            }
            result.totalNodesCount++;
          }
        }
        if (Array.isArray(conv.canvas.edges)) {
          for (let k = 0; k < conv.canvas.edges.length; k++) {
            const edge = conv.canvas.edges[k];
            if (!edge || !edge.id || !UUID_REGEX.test(edge.id)) {
              convValid = false;
              result.validationErrors.push(`Conversation [${i}] canvas edge [${k}] has invalid UUID id`);
            }
            result.totalEdgesCount++;
          }
        }
        if (Array.isArray(conv.canvas.groups)) {
          for (let k = 0; k < conv.canvas.groups.length; k++) {
            const group = conv.canvas.groups[k];
            if (!group || !group.id || !UUID_REGEX.test(group.id)) {
              convValid = false;
              result.validationErrors.push(`Conversation [${i}] canvas group [${k}] has invalid UUID id`);
            }
            result.totalGroupsCount++;
          }
        }
      }

      if (convValid) {
        result.validConversationCount++;
      } else {
        result.corruptConversationCount++;
      }
    }

    result.isValid = result.corruptConversationCount === 0;
    return result;
  }

  /**
   * Executes atomic, server-authoritative workspace migration.
   */
  async migrateWorkspace(
    actor: PersistenceActor,
    req: MigrateWorkspaceRequest
  ): Promise<MigrateWorkspaceResponse> {
    const targetWorkspaceId = req.targetWorkspaceId;
    if (!targetWorkspaceId) {
      throw new PersistenceError("VALIDATION_ERROR", "Target workspace ID is required for migration");
    }

    // 1. Authorize actor: must be owner, admin, editor, or member. Viewers receive FORBIDDEN (403).
    await requireWorkspaceRole(this.client, targetWorkspaceId, actor, ["owner", "admin", "editor", "member"]);

    // 2. Validate source key and payload structure
    if (req.payload.sourceStorageKey !== "echo-conversations") {
      throw new PersistenceError("VALIDATION_ERROR", `Invalid sourceStorageKey: "${req.payload.sourceStorageKey}"`);
    }

    const conversations = req.payload.conversations || [];
    const validation = this.validateLegacyData(conversations);
    if (!validation.isValid) {
      throw new PersistenceError(
        "VALIDATION_ERROR",
        `Migration payload validation failed: ${validation.validationErrors.slice(0, 5).join("; ")}`
      );
    }

    // 3. Execute atomic PostgreSQL stored procedure
    const { data, error } = await this.client.rpc("migrate_workspace_tx", {
      p_workspace_id: targetWorkspaceId,
      p_actor_id: actor.userId,
      p_conversations: conversations,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("FORBIDDEN")) {
        throw new PersistenceError("FORBIDDEN", msg);
      }
      if (msg.includes("COLLISION")) {
        throw new PersistenceError(
          "CONFLICT",
          `Cross-workspace collision detected (data already migrated to another workspace). ${msg}`
        );
      }
      if (msg.includes("NOT_FOUND")) {
        throw new PersistenceError("NOT_FOUND", msg);
      }
      throw new PersistenceError("DATABASE_ERROR", `Failed to migrate workspace: ${msg}`);
    }

    const result = data as {
      success: boolean;
      targetWorkspaceId: WorkspaceId;
      importedConversations: number;
      importedMessages: number;
      importedNodes: number;
      importedEdges: number;
      importedGroups: number;
      skippedDuplicates: number;
      migratedAt: string;
    };

    return {
      success: true,
      targetWorkspaceId: result.targetWorkspaceId,
      importedConversations: result.importedConversations,
      importedMessages: result.importedMessages,
      importedNodes: result.importedNodes,
      importedEdges: result.importedEdges,
      importedGroups: result.importedGroups,
      skippedDuplicates: result.skippedDuplicates,
      migratedAt: result.migratedAt,
      backupStorageKey: "echo-conversations-backup",
      completionFlagKey: "echo-migrated-v1",
    };
  }
}
