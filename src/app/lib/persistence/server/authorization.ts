/**
 * Phase 13.3 — Server Authorization Boundary
 *
 * Enforces workspace tenant scoping and role-based permissions strictly derived
 * from the database. Client-supplied roles and permissions are NEVER trusted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceId, WorkspaceMemberRole } from "../index";
import type { PersistenceActor } from "./auth";
import { PersistenceError } from "./errors";

export type WorkspaceAuthorizationContext = {
  workspaceId: WorkspaceId;
  userId: string;
  role: WorkspaceMemberRole;
};

/**
 * Resolves the authenticated actor's membership and role in the target workspace.
 * Throws FORBIDDEN or NOT_FOUND if the user has no membership row.
 */
export async function resolveWorkspaceAuthorization(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  actor: PersistenceActor
): Promise<WorkspaceAuthorizationContext> {
  if (!workspaceId || typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new PersistenceError("VALIDATION_ERROR", "workspaceId is required");
  }

  const { data, error } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (error) {
    throw new PersistenceError("DATABASE_ERROR", `Failed to resolve workspace membership: ${error.message}`);
  }

  if (!data) {
    throw new PersistenceError("FORBIDDEN", `User ${actor.userId} is not a member of workspace ${workspaceId}`);
  }

  return {
    workspaceId,
    userId: actor.userId,
    role: data.role as WorkspaceMemberRole,
  };
}

/**
 * Asserts that the actor is a member of the workspace.
 */
export async function requireWorkspaceMember(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  actor: PersistenceActor
): Promise<WorkspaceAuthorizationContext> {
  return resolveWorkspaceAuthorization(client, workspaceId, actor);
}

/**
 * Asserts that the actor possesses one of the required roles in the workspace.
 */
export async function requireWorkspaceRole(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  actor: PersistenceActor,
  allowedRoles: WorkspaceMemberRole[]
): Promise<WorkspaceAuthorizationContext> {
  const authContext = await resolveWorkspaceAuthorization(client, workspaceId, actor);

  if (!allowedRoles.includes(authContext.role)) {
    throw new PersistenceError(
      "FORBIDDEN",
      `Actor role '${authContext.role}' lacks required permission (allowed: ${allowedRoles.join(", ")})`
    );
  }

  return authContext;
}
