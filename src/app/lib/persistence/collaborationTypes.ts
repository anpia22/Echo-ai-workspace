/**
 * Phase 13.8 — Collaboration & Room Persistence Types
 *
 * Defines DTOs and contracts for durable collaboration room sessions
 * and historical participant logs.
 *
 * CRITICAL INVARIANTS:
 * - RoomId represents the correlation token matching Phase 10 realtime channel identity.
 * - WorkspaceId represents the authoritative tenancy boundary.
 * - Live presence and realtime sync remain 100% owned by Phase 10.
 */

import type { IsoTimestampString, UserId, WorkspaceId } from "./types";

export type RoomPersistenceStatus = "active" | "closed";

export type CollaborationRoomRecord = {
  id: string; // roomId
  workspaceId: WorkspaceId;
  title?: string;
  status: RoomPersistenceStatus;
  createdBy?: UserId;
  metadata: Record<string, unknown>;
  lastKnownState?: Record<string, unknown>;
  createdAt: IsoTimestampString;
  closedAt?: IsoTimestampString;
  updatedAt: IsoTimestampString;
};

export type CollaborationParticipantRecord = {
  id: string;
  roomId: string;
  workspaceId: WorkspaceId;
  userId: UserId;
  displayName: string;
  color: string;
  joinedAt: IsoTimestampString;
  leftAt?: IsoTimestampString;
  createdAt: IsoTimestampString;
  updatedAt: IsoTimestampString;
};

export type CreateCollaborationRoomRequest = {
  roomId: string;
  workspaceId: WorkspaceId;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type CreateCollaborationRoomResponse = {
  room: CollaborationRoomRecord;
};

export type CloseCollaborationRoomRequest = {
  roomId: string;
  workspaceId?: WorkspaceId;
  lastKnownState?: Record<string, unknown>;
  title?: string;
};

export type CloseCollaborationRoomResponse = {
  room: CollaborationRoomRecord;
};

export type RecordCollaborationParticipantRequest = {
  roomId: string;
  workspaceId: WorkspaceId;
  userId: UserId;
  displayName: string;
  color?: string;
};

export type CollaborationRoomHistoryResponse = {
  rooms: CollaborationRoomRecord[];
  totalCount: number;
};
