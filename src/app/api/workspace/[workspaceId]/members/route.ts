/** GET /api/workspace/[workspaceId]/members — members and the caller's role (any member). */

import { NextResponse } from "next/server";
import { resolveServerActor } from "../../../../lib/persistence/server/auth";
import { getServerSupabaseClient } from "../../../../lib/persistence/server/db";
import { requireWorkspaceMember } from "../../../../lib/persistence/server/authorization";
import { listMembers } from "../../../../lib/invites/inviteStore";
import { errorResponse, isUuid, validationError } from "../../../../lib/invites/routeHelpers";

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    if (!isUuid(workspaceId)) return validationError("Invalid workspace ID format");
    const actor = await resolveServerActor(request);
    const client = getServerSupabaseClient();
    const auth = await requireWorkspaceMember(client, workspaceId, actor);
    const members = await listMembers(client, workspaceId);
    return NextResponse.json({ members, you: { userId: actor.userId, role: auth.role } }, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to list members");
  }
}
