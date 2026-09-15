/**
 * Phase 13.1 — Persistent Backend Workspace: Workspace Contracts
 *
 * Explicit serializable DTOs for Workspace, Members, and lifecycle operations.
 *
 * CRITICAL INVARIANTS:
 * - Clients can never arbitrarily declare or self-promote membership roles.
 * - revision is server-authoritative and increments upon committed mutations.
 * - Workspace is the root tenant boundary for authorization and foreign keys.
 */

import type {
  IsoTimestampString,
  ServerRevision,
  UserId,
  WorkspaceId,
} from "./types";
import type { ConversationRecord, MessageRecord } from "./conversationTypes";
import type { CanvasSnapshotRecord } from "./canvasTypes";
import type { MeetingRecord } from "./meetingTypes";

/**
 * Supported workspace membership roles.
 * Enforced at API/RLS boundary.
 */
export type WorkspaceMemberRole = "owner" | "admin" | "editor" | "member" | "viewer";

/**
 * Durable Workspace domain record.
 */
export type Workspace = {
  id: WorkspaceId;
  title: string;
  description?: string;
  settings?: Record<string, unknown>;
  revision: ServerRevision;
  createdAt: IsoTimestampString;
  updatedAt: IsoTimestampString;
};

/**
 * Membership association linking a user to a workspace with role & attribution.
 */
export type WorkspaceMember = {
  id: string;
  workspaceId: WorkspaceId;
  userId: UserId;
  displayName: string;
  role: WorkspaceMemberRole;
  color: string;
  createdAt: IsoTimestampString;
  lastSeenAt?: IsoTimestampString;
};

/**
 * Request DTO for creating a new persistent workspace.
 */
export type CreateWorkspaceRequest = {
  id?: WorkspaceId;
  title: string;
  description?: string;
  settings?: Record<string, unknown>;
};

/**
 * Response DTO after workspace initialization.
 */
export type CreateWorkspaceResponse = {
  workspace: Workspace;
  member: WorkspaceMember;
};

/**
 * Unified hydration bundle returned when opening a workspace.
 * Provides all data required to hydrate the client in a single round-trip.
 *
 * Hydration order on client:
 * 1. Normalize canvas -> canvasRef.current = loadedCanvas -> setCanvas(loadedCanvas)
 * 2. Set active conversation & messages
 * 3. Populate meeting history
 * 4. Signal isLoaded = true
 */
export type LoadWorkspaceResponse = {
  workspace: Workspace;
  members: WorkspaceMember[];
  conversations: ConversationRecord[];
  activeConversationMessages: MessageRecord[];
  canvas: CanvasSnapshotRecord;
  recentMeetings: MeetingRecord[];
};
