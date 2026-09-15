/**
 * Phase 13.5 — Client Canvas Persistence API Boundary
 *
 * Client-safe HTTP wrapper for POST /api/workspace/[workspaceId]/canvas.
 * CRITICAL INVARIANT: Client-only. Never imports server/repository/database modules.
 *
 * Failure semantics:
 * - 409 STALE_REVISION → CanvasPersistenceConflictError (caller must surface conflict status)
 * - 400/401/403/404/500 → CanvasPersistenceApiError (caller must surface error status)
 * - No automatic retries (Phase 13.5 scope)
 */

export type CanvasPersistenceMutationPayload = {
  expectedBaseRevision: number;
  upsertNodes?: Array<{
    id: string;
    nodeType: string;
    title: string;
    description?: string;
    positionX: number;
    positionY: number;
  }>;
  deleteNodeIds?: string[];
  upsertEdges?: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    relationship?: string;
  }>;
  deleteEdgeIds?: string[];
  upsertGroups?: Array<{
    id: string;
    title: string;
    memberIds: string[];
    color?: string;
  }>;
  deleteGroupIds?: string[];
};

export type CanvasPersistenceSuccessResult = {
  ok: true;
  workspaceId: string;
  previousRevision: number;
  newRevision: number;
};

export class CanvasPersistenceApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CanvasPersistenceApiError";
    this.status = status;
    this.code = code;
  }
}

export class CanvasPersistenceConflictError extends Error {
  readonly status = 409;
  readonly code = "STALE_REVISION";

  constructor(message: string) {
    super(message);
    this.name = "CanvasPersistenceConflictError";
  }
}

/**
 * Persists a canvas mutation batch to the server.
 *
 * On success: returns { ok: true, workspaceId, previousRevision, newRevision }.
 * On STALE_REVISION (409): throws CanvasPersistenceConflictError.
 * On other errors: throws CanvasPersistenceApiError.
 *
 * The caller MUST update its local persistenceRevision to newRevision on success.
 * The caller MUST set status to "conflict" on CanvasPersistenceConflictError.
 * The caller MUST set status to "error" on CanvasPersistenceApiError.
 */
export async function persistCanvasMutation(
  workspaceId: string,
  payload: CanvasPersistenceMutationPayload,
  signal?: AbortSignal
): Promise<CanvasPersistenceSuccessResult> {
  const res = await fetch(
    `/api/workspace/${encodeURIComponent(workspaceId)}/canvas`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }
  );

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Swallow JSON parse failure; fall through to status check
  }

  if (res.status === 409) {
    const message =
      typeof json.message === "string"
        ? json.message
        : `Canvas persistence conflict: stale revision (HTTP 409)`;
    throw new CanvasPersistenceConflictError(message);
  }

  if (!res.ok) {
    const code = typeof json.code === "string" ? json.code : "CANVAS_PERSIST_ERROR";
    const message =
      typeof json.message === "string"
        ? json.message
        : `Failed to persist canvas mutation (HTTP ${res.status})`;
    throw new CanvasPersistenceApiError(res.status, code, message);
  }

  return json as unknown as CanvasPersistenceSuccessResult;
}
