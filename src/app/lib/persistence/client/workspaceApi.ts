/**
 * Phase 13.4 — Client Workspace API Boundary
 *
 * Client-safe HTTP wrapper for communicating with server persistence API routes.
 * CRITICAL INVARIANT: Client-only! Never imports server/repository/database modules.
 */

import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  LoadWorkspaceResponse,
} from "../workspaceTypes";

export class WorkspaceApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WorkspaceApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Creates a new persistent workspace via POST /api/workspace.
 */
export async function createWorkspaceApi(
  req?: CreateWorkspaceRequest,
  signal?: AbortSignal
): Promise<CreateWorkspaceResponse> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req || {}),
    signal,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code || "API_ERROR";
    const message = json?.error?.message || `Failed to create workspace (HTTP ${res.status})`;
    throw new WorkspaceApiError(res.status, code, message);
  }

  return json as CreateWorkspaceResponse;
}

/**
 * Loads a unified workspace hydration bundle via GET /api/workspace/[workspaceId].
 */
export async function loadWorkspaceApi(
  workspaceId: string,
  signal?: AbortSignal
): Promise<LoadWorkspaceResponse> {
  const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code || "API_ERROR";
    const message = json?.error?.message || `Failed to load workspace (HTTP ${res.status})`;
    throw new WorkspaceApiError(res.status, code, message);
  }

  return json as LoadWorkspaceResponse;
}
