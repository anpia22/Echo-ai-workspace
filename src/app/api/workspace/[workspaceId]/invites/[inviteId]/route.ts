/** DELETE /api/workspace/[workspaceId]/invites/[inviteId] — revoke an invite (owner/admin). */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../../lib/persistence/server/db";
import { requireWorkspaceRole } from "../../../../../lib/persistence/server/authorization";
import { revokeInvite } from "../../../../../lib/invites/inviteStore";
import { errorResponse, isUuid, validationError } from "../../../../../lib/invites/routeHelpers";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; inviteId: string }> }
) {
  try {
    const { workspaceId, inviteId } = await context.params;
    if (!isUuid(workspaceId) || !isUuid(inviteId)) return validationError("Invalid ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    await requireWorkspaceRole(client, workspaceId, actor, ["owner", "admin"]);
    await revokeInvite(client, workspaceId, inviteId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to revoke invite");
  }
}
