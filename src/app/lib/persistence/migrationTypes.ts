/**
 * Phase 13.1 — Persistent Backend Workspace: localStorage Migration Contracts
 *
 * Explicit DTOs for validating, ingesting, and verifying legacy localStorage data
 * (`echo-conversations`) into PostgreSQL workspaces.
 *
 * CRITICAL INVARIANTS:
 * 1. Migration is GATED, not automatic silent deletion.
 * 2. Pipeline:
 *    Inspect -> Validate -> Target Workspace Resolution -> Transaction -> Verify -> Mark Migrated.
 * 3. Local data is NEVER immediately destroyed:
 *    - On successful migration: `echo-conversations` is renamed to `echo-conversations-backup`.
 *    - Confirmation flag: `echo-migrated-v1 = true`.
 * 4. Stale or corrupted records failing validation are safely quarantined without aborting
 *    valid conversations.
 */

import type { IsoTimestampString, WorkspaceId } from "./types";

/**
 * Representation of an untrusted legacy conversation extracted from localStorage.
 */
export type LegacyConversationPayload = {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
  actions?: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  canvas: {
    nodes: Array<{
      id: string;
      nodeType: string;
      title: string;
      description?: string;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      relationship?: string;
    }>;
    groups: Array<{
      id: string;
      title: string;
      memberIds: string[];
    }>;
  };
  createdAt: string;
  updatedAt: string;
};

/**
 * Result of client or server validation pass on legacy localStorage data.
 */
export type LocalStorageMigrationValidationResult = {
  isValid: boolean;
  totalConversationsFound: number;
  validConversationCount: number;
  corruptConversationCount: number;
  totalMessagesCount: number;
  totalNodesCount: number;
  totalEdgesCount: number;
  totalGroupsCount: number;
  validationErrors: string[];
};

/**
 * Request payload sent to /api/workspace/[workspaceId]/migrate.
 */
export type MigrateWorkspaceRequest = {
  targetWorkspaceId?: WorkspaceId;
  defaultWorkspaceTitle?: string;
  payload: {
    sourceStorageKey: "echo-conversations";
    exportedAt: IsoTimestampString;
    conversations: LegacyConversationPayload[];
  };
};

/**
 * Response after atomic database migration and verification.
 */
export type MigrateWorkspaceResponse = {
  success: boolean;
  targetWorkspaceId: WorkspaceId;
  importedConversations: number;
  importedMessages: number;
  importedNodes: number;
  importedEdges: number;
  importedGroups: number;
  skippedDuplicates: number;
  migratedAt: IsoTimestampString;
  /** Suggested key under which client should preserve the local backup */
  backupStorageKey: "echo-conversations-backup";
  /** Flag key indicating migration has completed */
  completionFlagKey: "echo-migrated-v1";
};
