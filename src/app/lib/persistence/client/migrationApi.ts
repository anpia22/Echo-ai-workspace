/**
 * Phase 13.9 — Client Migration API Wrapper
 *
 * Client-only HTTP boundary for migrating legacy localStorage data ("echo-conversations")
 * to the persistent PostgreSQL backend via /api/workspace/[workspaceId]/migrate.
 *
 * CRITICAL INVARIANTS:
 * - Browser-safe; zero server dependencies.
 * - Throws strongly typed MigrationApiError on non-200 responses.
 */

import type {
  MigrateWorkspaceRequest,
  MigrateWorkspaceResponse,
} from "../migrationTypes";

export class MigrationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "MigrationApiError";
    this.code = code;
    this.status = status;
  }
}

export async function migrateWorkspaceApi(
  workspaceId: string,
  requestPayload: MigrateWorkspaceRequest
): Promise<MigrateWorkspaceResponse> {
  const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/migrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    let errorJson: { error?: { code?: string; message?: string } } = {};
    try {
      errorJson = await response.json();
    } catch {
      // Non-JSON response
    }
    const code = errorJson.error?.code || "MIGRATION_FAILED";
    const message = errorJson.error?.message || `HTTP ${response.status}: Failed to migrate workspace`;
    throw new MigrationApiError(code, message, response.status);
  }

  const data = await response.json();
  return data as MigrateWorkspaceResponse;
}
