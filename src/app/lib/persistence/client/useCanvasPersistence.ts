/**
 * Phase 13.5 — Canvas Persistence Hook
 *
 * React hook that coordinates canvas mutation persistence to the server.
 *
 * CRITICAL INVARIANTS:
 * - CanvasState remains the ONLY runtime canonical state. This hook is an ADDITIONAL boundary.
 * - Persistence never blocks the UI. Canvas updates are applied optimistically.
 * - Empty action arrays are silently skipped (no DB call, no revision bump).
 * - After each successful persistence: persistenceRevision MUST be updated to server newRevision.
 *   Failure to do this causes the next mutation to send a stale expectedBaseRevision.
 * - Stale revision (409 conflict): P1.2 rebases (fetches the latest revision) and retries a few
 *   times; status = "conflict" only if that still fails.
 * - P1.2: saves from this tab run one at a time, so they cannot conflict with each other.
 * - Persistence failure: status = "error". Never silently claims "saved".
 * - Does NOT write during hydration. Caller passes workspaceId only after hydration completes.
 * - Client-only: no server/repository/database imports.
 */

import { isReadOnlyError } from "./readOnly";
import { useCallback, useEffect, useRef, useState } from "react";
import { mapActionsToMutation, isMutationRequestEmpty, buildMoveNodeMutation } from "./canvasActionMapper";
import type { CanvasStateLike, CanvasNodeLike } from "./canvasActionMapper";
import {
  persistCanvasMutation,
  fetchCanvasRevisionApi,
  CanvasPersistenceConflictError,
} from "./canvasApi";
import type { CanvasPersistenceMutationPayload } from "./canvasApi";
import { SaveAbandoned, createSaveQueue, saveWithRebase } from "./canvasSaveQueue";
import type { CanvasAction } from "../../applyCanvasActions";

export type CanvasPersistenceStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export type UseCanvasPersistenceResult = {
  persistenceStatus: CanvasPersistenceStatus;
  /** Current authoritative server revision. Updated after each successful persistence. */
  persistenceRevision: number | null;
  /** Persist a set of CanvasActions. Non-blocking — returns immediately. */
  persistCanvas: (
    actions: CanvasAction[],
    prevCanvas: CanvasStateLike,
    nextCanvas: CanvasStateLike
  ) => void;
  /** Persist a single drag-end MOVE_NODE. Non-blocking — returns immediately. */
  persistNodeMove: (node: CanvasNodeLike) => void;
};

const SAVED_DISPLAY_MS = 2000;

/**
 * Hook for canvas persistence.
 *
 * @param workspaceId - The authoritative workspace ID. Pass null until hydration completes.
 * @param initialRevision - The server revision returned by workspace hydration.
 * @param onRevisionUpdate - Callback invoked with the new server revision after each success.
 */
export function useCanvasPersistence(
  workspaceId: string | null,
  initialRevision: number | null,
  onRevisionUpdate: (newRevision: number) => void
): UseCanvasPersistenceResult {
  const [persistenceStatus, setPersistenceStatus] =
    useState<CanvasPersistenceStatus>("idle");

  // Authoritative server revision — updated after each successful persistence
  const [persistenceRevision, setPersistenceRevision] = useState<number | null>(null);

  // Sync initialRevision into state once it first becomes available
  const initialRevisionSyncedRef = useRef(false);
  useEffect(() => {
    if (!initialRevisionSyncedRef.current && initialRevision !== null) {
      initialRevisionSyncedRef.current = true;
      setPersistenceRevision(initialRevision);
    }
  }, [initialRevision]);

  // Ref for the latest revision — used inside async callbacks to avoid stale closures
  const persistenceRevisionRef = useRef<number | null>(null);
  useEffect(() => {
    persistenceRevisionRef.current = persistenceRevision;
  }, [persistenceRevision]);

  // P1.2: saves run strictly one at a time, and only for the workspace they were made in.
  const saveQueueRef = useRef(createSaveQueue());
  const workspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  // Also update ref immediately when initialRevision first arrives
  useEffect(() => {
    if (initialRevision !== null && persistenceRevisionRef.current === null) {
      persistenceRevisionRef.current = initialRevision;
    }
  }, [initialRevision]);

  // Saved-status auto-clear timer
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, []);

  const handleSuccess = useCallback(
    (newRevision: number) => {
      setPersistenceRevision(newRevision);
      persistenceRevisionRef.current = newRevision;
      onRevisionUpdate(newRevision);

      clearSavedTimer();
      setPersistenceStatus("saved");
      savedTimerRef.current = setTimeout(() => {
        savedTimerRef.current = null;
        setPersistenceStatus("idle");
      }, SAVED_DISPLAY_MS);
    },
    [onRevisionUpdate, clearSavedTimer]
  );

  const handleError = useCallback((err: unknown) => {
    if (isReadOnlyError(err)) return; // viewers never write; nothing to report
    if (err instanceof SaveAbandoned) return; // workspace changed while the save was queued
    if (err instanceof CanvasPersistenceConflictError) {
      setPersistenceStatus("conflict");
      console.warn(
        "[useCanvasPersistence] Stale revision conflict — canvas may be out of sync. Reload to re-sync.",
        (err as Error).message
      );
    } else {
      setPersistenceStatus("error");
      console.error("[useCanvasPersistence] Persistence error:", err);
    }
  }, []);

  /**
   * Queues a mutation. It is sent on the latest known revision; if another person saved
   * first, the revision is refreshed and the same change is applied on top (P1.2).
   */
  const enqueueSave = useCallback(
    (targetWorkspaceId: string, mutation: Omit<CanvasPersistenceMutationPayload, "expectedBaseRevision">) => {
      setPersistenceStatus("saving");
      clearSavedTimer();

      void saveQueueRef.current
        .enqueue(() =>
          saveWithRebase(mutation, {
            send: (m, baseRevision) =>
              persistCanvasMutation(targetWorkspaceId, { ...m, expectedBaseRevision: baseRevision }),
            fetchRevision: () => fetchCanvasRevisionApi(targetWorkspaceId),
            getRevision: () => persistenceRevisionRef.current,
            setRevision: (revision) => {
              persistenceRevisionRef.current = revision;
            },
            isStale: (e) => e instanceof CanvasPersistenceConflictError,
            shouldContinue: () => workspaceIdRef.current === targetWorkspaceId,
          })
        )
        .then((result) => handleSuccess(result.newRevision))
        .catch((err) => handleError(err));
    },
    [handleSuccess, handleError, clearSavedTimer]
  );

  /**
   * Persists a batch of CanvasActions derived from applyCanvasActions().
   * Maps actions to mutation DTO using prevCanvas/nextCanvas for ID resolution.
   * Non-blocking: canvas is already updated; persistence happens in the background.
   */
  const persistCanvas = useCallback(
    (
      actions: CanvasAction[],
      prevCanvas: CanvasStateLike,
      nextCanvas: CanvasStateLike
    ): void => {
      // Guard 1: no workspace identity → skip (not yet hydrated)
      if (!workspaceId) {
        return;
      }

      // Guard 2: no revision → skip (hydration not complete)
      const currentRevision = persistenceRevisionRef.current;
      if (currentRevision === null) {
        return;
      }

      // Guard 3: empty action array → no DB call, no revision bump
      if (!Array.isArray(actions) || actions.length === 0) {
        return;
      }

      // Map actions to mutation DTO (derives IDs from canvas snapshots)
      const mutationPartial = mapActionsToMutation(actions, prevCanvas, nextCanvas, workspaceId);

      // Guard 4: empty mutation after mapping → no DB call
      if (isMutationRequestEmpty(mutationPartial)) {
        console.warn("[useCanvasPersistence] All actions produced empty mutation request; skipping.");
        return;
      }

      // Queue the save — does NOT block canvas runtime
      enqueueSave(workspaceId, {
        upsertNodes: mutationPartial.upsertNodes,
        deleteNodeIds: mutationPartial.deleteNodeIds,
        upsertEdges: mutationPartial.upsertEdges,
        deleteEdgeIds: mutationPartial.deleteEdgeIds,
        upsertGroups: mutationPartial.upsertGroups,
        deleteGroupIds: mutationPartial.deleteGroupIds,
      });
    },
    [workspaceId, enqueueSave]
  );

  /**
   * Persists a single drag-end node position update.
   * Called from updateNodePosition() which is already drag-end-only (onNodePositionChange).
   * Uses node ID directly — no action mapper needed for position-only updates.
   */
  const persistNodeMove = useCallback(
    (node: CanvasNodeLike): void => {
      // Guard 1: no workspace identity
      if (!workspaceId) {
        return;
      }

      // Guard 2: no revision
      const currentRevision = persistenceRevisionRef.current;
      if (currentRevision === null) {
        return;
      }

      const mutation = buildMoveNodeMutation(workspaceId, node);

      enqueueSave(workspaceId, { upsertNodes: mutation.upsertNodes });
    },
    [workspaceId, enqueueSave]
  );

  return {
    persistenceStatus,
    persistenceRevision,
    persistCanvas,
    persistNodeMove,
  };
}
