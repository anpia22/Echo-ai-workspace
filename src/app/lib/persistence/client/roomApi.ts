/**
 * Phase 13.8 — Client Room Persistence API Wrapper
 *
 * Client-only HTTP boundary for persisting collaboration rooms.
 * Communicates with Next.js /api/workspace/[workspaceId]/rooms routes.
 *
 * CRITICAL INVARIANTS:
 * - Never supplies user credentials or timestamps from client.
 * - Client-provided roomId is strictly an opaque correlation token matching Phase 10 channel.
 * - Browser-safe; zero server dependencies.
 */

import type { CollaborationRoomRecord } from "../collaborationTypes";

export class RoomPersistenceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RoomPersistenceApiError";
    this.code = code;
    this.status = status;
  }
}

export class RoomPersistenceConflictError extends RoomPersistenceApiError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "RoomPersistenceConflictError";
  }
}

export type CreateRoomPayload = {
  roomId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type CloseRoomPayload = {
  title?: string;
  lastKnownState?: Record<string, unknown>;
};

/**
 * Persists room start asynchronously.
 */
export async function createRoomApi(
  workspaceId: string,
  payload: CreateRoomPayload
): Promise<CollaborationRoomRecord> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roomId: payload.roomId,
      title: payload.title,
      metadata: payload.metadata,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 409) {
      throw new RoomPersistenceConflictError(data?.error?.message || "Room ID conflict");
    }
    throw new RoomPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to create room: HTTP ${response.status}`,
      response.status
    );
  }

  return data.room;
}

/**
 * Persists room termination asynchronously.
 */
export async function closeRoomApi(
  workspaceId: string,
  roomId: string,
  payload?: CloseRoomPayload
): Promise<CollaborationRoomRecord> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "closed",
        title: payload?.title,
        lastKnownState: payload?.lastKnownState,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RoomPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to close room: HTTP ${response.status}`,
      response.status
    );
  }

  return data.room;
}

/**
 * Lists past collaboration rooms for a workspace.
 */
export async function listRoomsApi(workspaceId: string): Promise<CollaborationRoomRecord[]> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/rooms`, {
    method: "GET",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RoomPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to fetch rooms: HTTP ${response.status}`,
      response.status
    );
  }

  return data.rooms || [];
}

/**
 * Retrieves a single room record by ID.
 */
export async function getRoomApi(workspaceId: string, roomId: string): Promise<CollaborationRoomRecord> {
  const response = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "GET",
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RoomPersistenceApiError(
      data?.error?.code || "PERSISTENCE_ERROR",
      data?.error?.message || `Failed to get room: HTTP ${response.status}`,
      response.status
    );
  }

  return data.room;
}
