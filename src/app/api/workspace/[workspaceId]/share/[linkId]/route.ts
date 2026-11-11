/** DELETE /api/workspace/[workspaceId]/share/[linkId] — unpublish: revoke a public link (owner/admin). */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../../lib/persistence/server/db";
import { requireWorkspaceRole } from "../../../../../lib/persistence/server/authorization";
import { revokeShareLink } from "../../../../../lib/share/shareStore";
import { errorResponse, isUuid, validationError } from "../../../../../lib/invites/routeHelpers";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; linkId: string }> }
) {
  try {
    const { workspaceId, linkId } = await context.params;
    if (!isUuid(workspaceId) || !isUuid(linkId)) return validationError("Invalid ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    await requireWorkspaceRole(client, workspaceId, actor, ["owner", "admin"]);
    await revokeShareLink(client, workspaceId, linkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Failed to revoke public link");
  }
}
