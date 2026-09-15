/**
 * Phase 13.8 — Client Hook: useRoomPersistence
 *
 * Provides non-blocking, asynchronous persistence for collaboration room sessions.
 *
 * CRITICAL INVARIANTS:
 * - Completely isolated from Phase 10 realtime runtime (Supabase broadcast, cursors, presence).
 * - Client-side lifecycle guards: persistedRoomIdsRef and activeRoomIdRef prevent
 *   redundant POST calls on rerenders and ensure room close never runs with stale IDs.
 * - Persistence errors NEVER block or interrupt the live collaboration session.
 * - Async recovery: if start persistence failed or was dropped, closing the room
 *   still attempts atomic close/recovery via the backend.
 * - Server-authoritative: timestamps and user identity are managed server-side.
 */

import { useCallback, useRef, useState } from "react";
import type { CollaborationRoomRecord } from "../collaborationTypes";
import {
  closeRoomApi,
  createRoomApi,
  listRoomsApi,
} from "./roomApi";

export type RoomPersistenceStatus = "idle" | "persisting" | "persisted" | "error";

export interface UseRoomPersistenceOptions {
  workspaceId: string | null;
  onPersistError?: (error: Error) => void;
}

export interface UseRoomPersistenceReturn {
  status: RoomPersistenceStatus;
  lastPersistedRoom: CollaborationRoomRecord | null;
  error: string | null;
  persistRoomStart: (
    roomId: string,
    title?: string,
    metadata?: Record<string, unknown>
  ) => Promise<CollaborationRoomRecord | null>;
  persistRoomClose: (
    roomId: string,
    lastKnownState?: Record<string, unknown>,
    title?: string
  ) => Promise<CollaborationRoomRecord | null>;
  fetchRoomHistory: () => Promise<CollaborationRoomRecord[]>;
}

export function useRoomPersistence({
  workspaceId,
  onPersistError,
}: UseRoomPersistenceOptions): UseRoomPersistenceReturn {
  const [status, setStatus] = useState<RoomPersistenceStatus>("idle");
  const [lastPersistedRoom, setLastPersistedRoom] = useState<CollaborationRoomRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRoomIdRef = useRef<string | null>(null);
  const persistedRoomIdsRef = useRef<Set<string>>(new Set());
  const pendingStartPromisesRef = useRef<Map<string, Promise<CollaborationRoomRecord | null>>>(new Map());

  /**
   * Asynchronously records collaboration room start.
   * Guarded against duplicate calls on component re-renders.
   * Runtime continues immediately without awaiting DB completion.
   */
  const persistRoomStart = useCallback(
    async (
      roomId: string,
      title?: string,
      metadata?: Record<string, unknown>
    ): Promise<CollaborationRoomRecord | null> => {
      if (!workspaceId || !roomId || roomId.trim() === "") {
        return null;
      }

      const cleanRoomId = roomId.trim();
      activeRoomIdRef.current = cleanRoomId;

      // Duplicate guard: if already persisted or in flight, return existing or pending
      if (persistedRoomIdsRef.current.has(cleanRoomId)) {
        return lastPersistedRoom;
      }

      const inFlight = pendingStartPromisesRef.current.get(cleanRoomId);
      if (inFlight) {
        return inFlight;
      }

      setStatus("persisting");
      setError(null);

      const promise = (async () => {
        try {
          const room = await createRoomApi(workspaceId, {
            roomId: cleanRoomId,
            title,
            metadata,
          });

          persistedRoomIdsRef.current.add(cleanRoomId);
          setLastPersistedRoom(room);
          setStatus("persisted");
          return room;
        } catch (err: unknown) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj.message);
          setStatus("error");
          onPersistError?.(errorObj);
          // Do NOT throw: Live collaboration runtime must never crash on persistence errors
          return null;
        } finally {
          pendingStartPromisesRef.current.delete(cleanRoomId);
        }
      })();

      pendingStartPromisesRef.current.set(cleanRoomId, promise);
      return promise;
    },
    [workspaceId, lastPersistedRoom, onPersistError]
  );

  /**
   * Asynchronously marks collaboration room as closed.
   * Guarded against stale room IDs.
   * Handles recovery if start failed or was dropped.
   */
  const persistRoomClose = useCallback(
    async (
      roomId: string,
      lastKnownState?: Record<string, unknown>,
      title?: string
    ): Promise<CollaborationRoomRecord | null> => {
      if (!workspaceId || !roomId || roomId.trim() === "") {
        return null;
      }

      const cleanRoomId = roomId.trim();

      // Guard: reset active room reference if it matches
      if (activeRoomIdRef.current === cleanRoomId) {
        activeRoomIdRef.current = null;
      }

      setStatus("persisting");
      setError(null);

      try {
        const room = await closeRoomApi(workspaceId, cleanRoomId, {
          title: title || "Echo Collaboration Room",
          lastKnownState,
        });

        persistedRoomIdsRef.current.delete(cleanRoomId);
        setLastPersistedRoom(room);
        setStatus("persisted");
        return room;
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj.message);
        setStatus("error");
        onPersistError?.(errorObj);
        return null;
      }
    },
    [workspaceId, onPersistError]
  );

  /**
   * Loads past collaboration rooms for the current workspace.
   */
  const fetchRoomHistory = useCallback(async (): Promise<CollaborationRoomRecord[]> => {
    if (!workspaceId) {
      return [];
    }

    try {
      return await listRoomsApi(workspaceId);
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj.message);
      onPersistError?.(errorObj);
      return [];
    }
  }, [workspaceId, onPersistError]);

  return {
    status,
    lastPersistedRoom,
    error,
    persistRoomStart,
    persistRoomClose,
    fetchRoomHistory,
  };
}
