/**
 * PATCH  /api/workspace/[workspaceId]/members/[userId] — change a member's role (owner/admin).
 * DELETE /api/workspace/[workspaceId]/members/[userId] — remove a member, or leave (self).
 * The rules live in inviteLogic.decideRoleChange / decideRemoval.
 */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../../lib/persistence/server/db";
import { requireWorkspaceMember } from "../../../../../lib/persistence/server/authorization";
import { PersistenceError } from "../../../../../lib/persistence/server/errors";
import { decideRemoval, decideRoleChange, isInvitableRole } from "../../../../../lib/invites/inviteLogic";
import { getMemberRole, removeMember, setMemberRole } from "../../../../../lib/invites/inviteStore";
import { errorResponse, isUuid, readJsonBody, validationError } from "../../../../../lib/invites/routeHelpers";

type Ctx = { params: Promise<{ workspaceId: string; userId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { workspaceId, userId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    const auth = await requireWorkspaceMember(client, workspaceId, actor);

    const body = await readJsonBody(request);
    if (body === null) return validationError("Malformed JSON payload");

    const targetRole = await getMemberRole(client, workspaceId, userId);
    if (!targetRole) throw new PersistenceError("NOT_FOUND", "Member not found");

    const newRole = (body as Record<string, unknown>).role;
    const decision = decideRoleChange({
      actorRole: auth.role,
      actorUserId: actor.userId,
      targetUserId: userId,
      targetRole,
      newRole,
    });
    if (!decision.ok) throw new PersistenceError("FORBIDDEN", decision.message);
    if (!isInvitableRole(newRole)) return validationError("role must be 'editor' or 'viewer'");

    await setMemberRole(client, workspaceId, userId, newRole);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to change role");
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const { workspaceId, userId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    const auth = await requireWorkspaceMember(client, workspaceId, actor);

    const targetRole = await getMemberRole(client, workspaceId, userId);
    if (!targetRole) throw new PersistenceError("NOT_FOUND", "Member not found");

    const decision = decideRemoval({
      actorRole: auth.role,
      actorUserId: actor.userId,
      targetUserId: userId,
      targetRole,
    });
    if (!decision.ok) throw new PersistenceError("FORBIDDEN", decision.message);

    await removeMember(client, workspaceId, userId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to remove member");
  }
}
